import { extname } from "node:path";
import { isMap, isScalar, isSeq, LineCounter, parseDocument } from "yaml";
import type { IndexedModelPair, V3FeedIndex } from "../lifecycle/feed.ts";
import type { GitTreeSnapshot } from "../repository/git.ts";
import { DETECTOR_MANIFEST_VERSION, DETECTOR_RULES } from "./manifest.ts";
import { canonicalSha256 } from "../shared/status.ts";
import type {
  CoverageDiagnostic,
  EvidenceFact,
  EvidenceScope,
  ModelResolution,
  ModelSelectorKind,
  PlatformResolution,
  ScanStatus,
} from "../shared/types.ts";

const MAX_EVIDENCE_FACTS = 100_000;
const ENVIRONMENT_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;
const DOTENV_PATH = /(?:^|\/)\.env(?:\.[A-Za-z0-9_-]+)*$/u;
const GITHUB_WORKFLOW_PATH = /^\.github\/workflows\/[^/]+\.ya?ml$/u;
const SOURCE_EXTENSIONS = new Set([
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".py",
  ".go",
  ".java",
  ".kt",
  ".kts",
  ".cs",
  ".rb",
  ".php",
  ".rs",
  ".swift",
  ".c",
  ".h",
  ".cc",
  ".cpp",
  ".sh",
]);
const JS_EXTENSIONS = new Set([".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".mts", ".cts"]);
/**
 * Extensions where `<` in a value position opens a JSX element. `.ts`, `.mts`,
 * and `.cts` are excluded deliberately: `tsc` rejects JSX in those files, while
 * the `<Type>value` assertion form is legal there, so JSX lexing would
 * desynchronize valid TypeScript instead of recovering it.
 */
const JSX_EXTENSIONS = new Set([".js", ".jsx", ".mjs", ".cjs", ".tsx"]);
const HCL_EXTENSIONS = new Set([".tf", ".hcl"]);
const IDENTIFIER_CHARACTER = /^[\p{L}\p{N}\p{M}._:/-]$/u;
const DIRECT_POLICY_RULES = new Set(
  DETECTOR_RULES.filter((rule) => rule.policyEligible).map((rule) => rule.ruleId),
);

type Token = {
  kind: "identifier" | "string" | "punctuation";
  value: string;
  raw: string;
  offset: number;
  line: number;
  column: number;
  static: boolean;
  /**
   * A JSX tag or attribute name. It lexes as an identifier so bracket tracking
   * stays balanced, but it is markup rather than an expression: `<Row openai="x" />`
   * must not read as reassigning the `openai` binding.
   */
  jsx?: true;
};

type TokenizationIssue = {
  kind:
    | "invalid-unicode-escape"
    | "mismatched-delimiter"
    | "unterminated-block-comment"
    | "unterminated-regex-literal"
    | "unterminated-string-literal";
  line: number;
  column: number;
};

type TokenizationResult = {
  tokens: Token[];
  issue?: TokenizationIssue;
};

type SemanticLiteralSpan = {
  modelId: string;
  startOffset: number;
  endOffset: number;
};

type ResolvedValue = {
  rawValue: string;
  modelId?: string;
  modelResolution: ModelResolution;
  selectorKind: ModelSelectorKind;
  trace: EvidenceFact["resolutionTrace"];
  environmentVariable?: string;
};

type EnvironmentReference = {
  variable: string;
  fallbackIndex?: number;
};

type ClientBinding = {
  variable: string;
  integration: "openai" | "anthropic" | "google" | "aws-bedrock";
  servingPlatform?: string;
  platformResolution: PlatformResolution;
  selectorKind: ModelSelectorKind;
  endpointSafe: boolean;
};

type ConsumedEnvironmentSelector = {
  variable: string;
  ruleId: string;
  scope: EvidenceScope;
  environment: EvidenceFact["environment"];
  binding: ClientBinding;
  location: EvidenceFact["locations"][number];
};

type EnvironmentAssignment = {
  ruleId: "binding.env.consumed-model@1" | "binding.github-actions.consumed-model@1";
  variable: string;
  value: string;
  path: string;
  blobOid: string;
  line: number;
  column: number;
};

export type DetectionResult = {
  evidence: EvidenceFact[];
  diagnostics: CoverageDiagnostic[];
  scanStatus: ScanStatus;
};

function assertEvidenceBudget(count: number): void {
  if (count > MAX_EVIDENCE_FACTS) {
    throw new Error(`Detector evidence exceeds the aggregate ${MAX_EVIDENCE_FACTS}-fact budget.`);
  }
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * Scanned sources are untrusted: an out-of-range escape such as `\u{110000}`
 * must degrade to a replacement character rather than throw a RangeError out of
 * the whole assessment.
 */
function fromCodePointOrReplacement(codePoint: number): string {
  if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) return "�";
  return String.fromCodePoint(codePoint);
}

function decodeStringContent(
  raw: string,
  quoteLength: number,
  closed: boolean,
): { value: string; invalidUnicodeEscape: boolean } {
  const content = raw.slice(quoteLength, closed ? raw.length - quoteLength : raw.length);
  let invalidUnicodeEscape = false;
  const value = content.replace(/\\(?:u\{([0-9a-fA-F]+)\}|u([0-9a-fA-F]{4})|x([0-9a-fA-F]{2})|n|r|t|b|f|v|0|([\\'"`]))/g, (match, wide, unicode, hex, simple) => {
    if (wide !== undefined) {
      const codePoint = Number.parseInt(wide, 16);
      if (codePoint > 0x10ffff) invalidUnicodeEscape = true;
      return fromCodePointOrReplacement(codePoint);
    }
    if (unicode !== undefined) return fromCodePointOrReplacement(Number.parseInt(unicode, 16));
    if (hex !== undefined) return fromCodePointOrReplacement(Number.parseInt(hex, 16));
    if (simple !== undefined) return simple;
    const escapes: Record<string, string> = {
      "\\n": "\n",
      "\\r": "\r",
      "\\t": "\t",
      "\\b": "\b",
      "\\f": "\f",
      "\\v": "\v",
      "\\0": "\0",
    };
    return escapes[match] ?? match;
  });
  return { value, invalidUnicodeEscape };
}

/** Keywords after which a `/` starts a regex literal rather than a division. */
const REGEX_PRECEDING_KEYWORDS = new Set([
  "return",
  "typeof",
  "instanceof",
  "in",
  "of",
  "new",
  "delete",
  "void",
  "throw",
  "case",
  "do",
  "else",
  "yield",
  "await",
]);

/** Whether `token` ends a value, which makes a following `/` a division. */
function valueEndingToken(token: Token | undefined): boolean {
  if (token === undefined) return false;
  if (token.kind === "string") return true;
  if (token.kind === "identifier") return !REGEX_PRECEDING_KEYWORDS.has(token.value);
  // Digits tokenize as punctuation here, so a trailing digit ends a value.
  if (/^[0-9]$/u.test(token.value)) return true;
  return token.value === ")" || token.value === "]" || token.value === "}" ||
    token.value === "++" || token.value === "--";
}

/**
 * Decide whether `/` opens a regex literal, using the previous significant
 * token: after a value (identifier, literal, `)`, `]`) it is division.
 */
function regexLiteralAllowed(tokens: readonly Token[]): boolean {
  let index = tokens.length - 1;
  // A TypeScript non-null assertion is postfix, so `filters[0]! / 100` divides,
  // while the prefix `!` of `!/ready/.test(state)` precedes a regex literal.
  if (structuralValue(tokens[index]) === "!" && valueEndingToken(tokens[index - 1])) {
    index -= 1;
  }
  return !valueEndingToken(tokens[index]);
}

/** Bounded opening-tag lookahead used to tell JSX from a type-parameter list. */
const JSX_TAG_LOOKAHEAD_CHARACTERS = 4_096;
const JSX_NAME_START = /[A-Za-z_$]/u;
const JSX_NAME_CHARACTER = /[A-Za-z0-9_$.:-]/u;

/** End of a quoted JSX attribute value, or -1 within the bounded lookahead. */
function jsxQuotedEnd(source: string, index: number, limit: number): number {
  const quote = source[index];
  for (let scan = index + 1; scan < limit; scan += 1) {
    if (source[scan] === quote) return scan + 1;
  }
  return -1;
}

/**
 * Characters that end a value, so a following `/` divides rather than opens a
 * regex literal. Mirrors the token-level rule in `valueEndingToken`, including
 * the `}` that closes an object literal or an arrow body.
 */
const JSX_VALUE_ENDING_CHARACTER = /[\p{L}\p{N}_$)\]}]/u;

/** Stands in for the value a stepped-over literal produced. */
const JSX_STEPPED_OVER_VALUE = "0";

/**
 * End of the string, template, comment, or regular-expression literal starting
 * at `index`, or `index` itself when none starts there. A construct that does
 * not terminate inside the bounded lookahead — and a `/` that turns out not to
 * open a regex literal — also yield `index`, so this scan can only ever improve
 * on plain character counting, never abandon a tag the naive count would have
 * found. `previous` is the last significant character before `index`, which is
 * what separates a regex literal from a division. Escapes are honoured because
 * this reads JavaScript inside an attribute expression, unlike the attribute
 * text `jsxQuotedEnd` reads.
 */
function jsxOpaqueEnd(
  source: string,
  index: number,
  limit: number,
  previous: string,
): number {
  const character = source[index] as string;
  if (character === '"' || character === "'") {
    for (let scan = index + 1; scan < limit; scan += 1) {
      const inner = source[scan];
      if (inner === "\\") scan += 1;
      else if (inner === "\n") break; // a quoted string cannot span a line
      else if (inner === character) return scan + 1;
    }
    return index;
  }
  if (character === "`") {
    let substitutions = 0;
    for (let scan = index + 1; scan < limit; scan += 1) {
      const inner = source[scan];
      if (inner === "\\") scan += 1;
      else if (inner === "$" && source[scan + 1] === "{") {
        substitutions += 1;
        scan += 1;
      } else if (inner === "}" && substitutions > 0) substitutions -= 1;
      else if (inner === "`" && substitutions === 0) return scan + 1;
    }
    return index;
  }
  if (character !== "/") return index;
  if (source[index + 1] === "*") {
    const closed = source.indexOf("*/", index + 2);
    return closed < 0 || closed + 2 > limit ? index : closed + 2;
  }
  if (source[index + 1] === "/") {
    const newline = source.indexOf("\n", index + 2);
    return newline < 0 || newline >= limit ? index : newline + 1;
  }
  if (JSX_VALUE_ENDING_CHARACTER.test(previous)) return index; // a division
  let characterClass = false;
  for (let scan = index + 1; scan < limit; scan += 1) {
    const inner = source[scan];
    if (inner === "\\") scan += 1;
    else if (inner === "\n") break; // a regex literal cannot span a line
    else if (inner === "[") characterClass = true;
    else if (inner === "]") characterClass = false;
    else if (inner === "/" && !characterClass) return scan + 1;
  }
  return index;
}

/**
 * End of a balanced `open`/`close` run starting at `index`, or -1 within the
 * bounded lookahead. Strings, templates, comments, and regex literals are
 * stepped over rather than counted: a brace inside one is not a delimiter, and
 * counting raw characters would end `code={"if (ready) {"}` early and make the
 * lookahead miss a real tag — losing every semantic fact in the file.
 */
function jsxBalancedEnd(
  source: string,
  index: number,
  limit: number,
  open: string,
  close: string,
): number {
  let depth = 0;
  let previous = "";
  for (let scan = index; scan < limit; scan += 1) {
    const character = source[scan] as string;
    const opaque = jsxOpaqueEnd(source, scan, limit, previous);
    if (opaque > scan) {
      const comment = character === "/" &&
        (source[scan + 1] === "/" || source[scan + 1] === "*");
      // A comment yields no value; a string, template, or regex literal does.
      if (!comment) previous = JSX_STEPPED_OVER_VALUE;
      scan = opaque - 1;
      continue;
    }
    if (character === open) depth += 1;
    else if (character === close) {
      depth -= 1;
      if (depth === 0) return scan + 1;
    }
    if (!/\s/u.test(character)) previous = character;
  }
  return -1;
}

/** End of a `{…}` JSX attribute value or spread, or -1 within the lookahead. */
function jsxBracedEnd(source: string, index: number, limit: number): number {
  return jsxBalancedEnd(source, index, limit, "{", "}");
}

/**
 * End of a `<…>` type-argument list on a JSX element such as
 * `<Tooltip<Datum> render={…} />`, or -1 within the lookahead.
 */
function jsxAngleEnd(source: string, index: number, limit: number): number {
  return jsxBalancedEnd(source, index, limit, "<", ">");
}

/**
 * Whether `<` at `offset` begins something shaped like a JSX opening tag. The
 * scan is bounded and exists to reject TypeScript type-parameter lists, which
 * are legal in `.tsx` at exactly the same value positions: `<T,>(value) => …`
 * stops at the comma and `<T extends Props>(value) => …` stops at `extends`.
 */
function looksLikeJsxTag(source: string, offset: number): boolean {
  const limit = Math.min(source.length, offset + JSX_TAG_LOOKAHEAD_CHARACTERS);
  let index = offset + 1;
  const first = source[index];
  if (first === undefined) return false;
  if (first === ">") return true; // `<>` fragment
  if (!JSX_NAME_START.test(first)) return false;
  while (index < limit && JSX_NAME_CHARACTER.test(source[index] as string)) index += 1;
  while (index < limit) {
    const character = source[index] as string;
    if (/\s/u.test(character)) {
      index += 1;
      continue;
    }
    if (character === ">") return true;
    if (character === "/" && source[index + 1] === ">") return true;
    if (character === "/" && source[index + 1] === "*") {
      const closed = source.indexOf("*/", index + 2);
      if (closed < 0 || closed + 2 > limit) return false;
      index = closed + 2;
      continue;
    }
    if (character === "/" && source[index + 1] === "/") {
      const newline = source.indexOf("\n", index + 2);
      if (newline < 0 || newline >= limit) return false;
      index = newline + 1;
      continue;
    }
    if (character === "=") {
      index += 1;
      continue;
    }
    if (character === "{") {
      index = jsxBracedEnd(source, index, limit);
      if (index < 0) return false;
      continue;
    }
    if (character === "'" || character === '"') {
      index = jsxQuotedEnd(source, index, limit);
      if (index < 0) return false;
      continue;
    }
    if (character === "<") {
      index = jsxAngleEnd(source, index, limit);
      if (index < 0) return false;
      continue;
    }
    if (JSX_NAME_START.test(character)) {
      const nameStart = index;
      while (index < limit && JSX_NAME_CHARACTER.test(source[index] as string)) index += 1;
      if (source.slice(nameStart, index) === "extends") return false;
      continue;
    }
    return false; // `,`, `(`, `:` — a type-parameter list, not a tag
  }
  return false; // the tag never closed inside the bounded lookahead
}

/**
 * Whether `<` at `offset` opens a JSX element. JSX shares the value-position
 * requirement of a regex literal, so `a < b`, `useState<string>()`, and
 * `new Map<string, number>()` all keep `<` as an operator. Two positions accept
 * an element but never a regex: `export default <App />`, and a statement that
 * follows a block, as in `}` then `<svg …></svg>;`.
 */
function jsxElementAllowed(
  tokens: readonly Token[],
  source: string,
  offset: number,
): boolean {
  const previous = tokens[tokens.length - 1];
  const valuePosition = regexLiteralAllowed(tokens) ||
    structuralValue(previous) === "}" ||
    isIdentifier(previous, "default");
  return valuePosition && looksLikeJsxTag(source, offset);
}

/**
 * Lexer state above module code. A JSX element suspends expression lexing until
 * its closing tag, and each `{…}` container inside one resumes it. `angleDepth`
 * tracks a type-argument list such as `<Tooltip<Datum> render={…} />`, whose
 * `>` closes the list rather than the opening tag.
 */
type LexerFrame =
  | {
    kind: "jsx";
    mode: "tag" | "children" | "closing";
    angleDepth: number;
    line: number;
    column: number;
  }
  | { kind: "jsx-expression"; braceDepth: number; line: number; column: number };

function tokenize(
  source: string,
  language: "javascript" | "python" | "hcl",
  jsx = false,
): TokenizationResult {
  const tokens: Token[] = [];
  let issue: TokenizationIssue | undefined;
  const reportIssue = (candidate: TokenizationIssue): void => {
    issue ??= candidate;
  };
  let offset = 0;
  let line = 1;
  let column = 1;
  const frames: LexerFrame[] = [];
  const advance = (character: string): void => {
    offset += character.length;
    if (character === "\n") {
      line += 1;
      column = 1;
    } else {
      column += [...character].length;
    }
  };
  const emitPunctuation = (value: string): void => {
    const tokenStart = offset;
    const tokenLine = line;
    const tokenColumn = column;
    for (const part of value) advance(part);
    tokens.push({
      kind: "punctuation",
      value,
      raw: value,
      offset: tokenStart,
      line: tokenLine,
      column: tokenColumn,
      static: true,
    });
  };
  /** Emit a JSX element, attribute, or closing-tag name as one identifier. */
  const emitJsxName = (): void => {
    const tokenStart = offset;
    const tokenLine = line;
    const tokenColumn = column;
    while (offset < source.length && JSX_NAME_CHARACTER.test(source[offset] as string)) {
      advance(source[offset] as string);
    }
    const raw = source.slice(tokenStart, offset);
    tokens.push({
      kind: "identifier",
      value: raw,
      raw,
      offset: tokenStart,
      line: tokenLine,
      column: tokenColumn,
      static: true,
      jsx: true,
    });
  };
  const consumeJavascriptTemplate = (): { closed: boolean; dynamic: boolean } => {
    type TemplateFrame = {
      mode: "text" | "expression";
      braceDepth: number;
      regexAllowed: boolean;
    };
    const frames: TemplateFrame[] = [{ mode: "text", braceDepth: 0, regexAllowed: true }];
    let dynamic = false;

    const consumeQuotedExpressionString = (quote: "'" | '"'): boolean => {
      advance(quote);
      let escaped = false;
      while (offset < source.length) {
        const current = source[offset] as string;
        if (current === "\n" && !escaped) return false;
        advance(current);
        if (escaped) escaped = false;
        else if (current === "\\") escaped = true;
        else if (current === quote) return true;
      }
      return false;
    };

    const consumeExpressionRegex = (): boolean => {
      advance("/");
      let escaped = false;
      let inClass = false;
      while (offset < source.length) {
        const current = source[offset] as string;
        if (current === "\n") return false;
        advance(current);
        if (escaped) {
          escaped = false;
          continue;
        }
        if (current === "\\") escaped = true;
        else if (current === "[") inClass = true;
        else if (current === "]") inClass = false;
        else if (current === "/" && !inClass) {
          while (offset < source.length && /[a-z]/u.test(source[offset] as string)) {
            advance(source[offset] as string);
          }
          return true;
        }
      }
      return false;
    };

    advance("`");
    while (offset < source.length) {
      const frame = frames.at(-1) as TemplateFrame;
      const current = source[offset] as string;
      const next = source[offset + 1];
      if (frame.mode === "text") {
        if (current === "\\") {
          advance(current);
          if (offset < source.length) advance(source[offset] as string);
          continue;
        }
        if (current === "`") {
          advance(current);
          frames.pop();
          if (frames.length === 0) return { closed: true, dynamic };
          const parent = frames.at(-1);
          if (parent !== undefined) parent.regexAllowed = false;
          continue;
        }
        if (current === "$" && next === "{") {
          dynamic = true;
          advance(current);
          advance("{");
          frame.mode = "expression";
          frame.braceDepth = 1;
          frame.regexAllowed = true;
          continue;
        }
        advance(current);
        continue;
      }

      if (/\s/u.test(current)) {
        advance(current);
        continue;
      }
      if (current === "'" || current === '"') {
        if (!consumeQuotedExpressionString(current)) return { closed: false, dynamic };
        frame.regexAllowed = false;
        continue;
      }
      if (current === "`") {
        frames.push({ mode: "text", braceDepth: 0, regexAllowed: true });
        advance(current);
        continue;
      }
      if (current === "/" && next === "/") {
        while (offset < source.length && source[offset] !== "\n") {
          advance(source[offset] as string);
        }
        continue;
      }
      if (current === "/" && next === "*") {
        advance(current);
        advance("*");
        let closed = false;
        while (offset < source.length) {
          const commentCharacter = source[offset] as string;
          if (commentCharacter === "*" && source[offset + 1] === "/") {
            advance(commentCharacter);
            advance("/");
            closed = true;
            break;
          }
          advance(commentCharacter);
        }
        if (!closed) return { closed: false, dynamic };
        continue;
      }
      const operatorPair = source.slice(offset, offset + 2);
      if (operatorPair === "++" || operatorPair === "--") {
        advance(operatorPair[0] as string);
        advance(operatorPair[1] as string);
        frame.regexAllowed = false;
        continue;
      }
      if (
        ["??", "=>", "==", "!=", "<=", ">=", "**", "&&", "||", "+=", "-=", "*=", "%="].includes(
          operatorPair,
        )
      ) {
        advance(operatorPair[0] as string);
        advance(operatorPair[1] as string);
        frame.regexAllowed = true;
        continue;
      }
      if (current === "/" && frame.regexAllowed) {
        if (!consumeExpressionRegex()) return { closed: false, dynamic };
        frame.regexAllowed = false;
        continue;
      }
      if (/[$_\p{L}]/u.test(current)) {
        const wordStart = offset;
        advance(current);
        while (offset < source.length && /[$_\p{L}\p{N}]/u.test(source[offset] as string)) {
          advance(source[offset] as string);
        }
        frame.regexAllowed = REGEX_PRECEDING_KEYWORDS.has(source.slice(wordStart, offset));
        continue;
      }
      if (/[0-9]/u.test(current)) {
        advance(current);
        while (offset < source.length && /[0-9A-Za-z_.]/u.test(source[offset] as string)) {
          advance(source[offset] as string);
        }
        frame.regexAllowed = false;
        continue;
      }
      if (current === "{") {
        advance(current);
        frame.braceDepth += 1;
        frame.regexAllowed = true;
        continue;
      }
      if (current === "}") {
        advance(current);
        frame.braceDepth -= 1;
        if (frame.braceDepth === 0) frame.mode = "text";
        else frame.regexAllowed = false;
        continue;
      }
      if (current === ")" || current === "]") {
        advance(current);
        frame.regexAllowed = false;
        continue;
      }
      if (current === "/") {
        advance(current);
        frame.regexAllowed = true;
        continue;
      }
      advance(current);
      frame.regexAllowed = current !== ")" && current !== "]";
    }
    return { closed: false, dynamic };
  };
  while (offset < source.length) {
    const start = offset;
    const startLine = line;
    const startColumn = column;
    const character = source[offset] as string;
    const next = source[offset + 1];
    const frame = frames.at(-1);
    if (frame?.kind === "jsx" && frame.mode === "children") {
      if (character === "<" && next === "/") {
        emitPunctuation("<");
        emitPunctuation("/");
        frame.mode = "closing";
        continue;
      }
      if (character === "<" && looksLikeJsxTag(source, offset)) {
        emitPunctuation("<");
        frames.push({
          kind: "jsx",
          mode: "tag",
          angleDepth: 0,
          line: startLine,
          column: startColumn,
        });
        continue;
      }
      if (character === "{") {
        emitPunctuation("{");
        frames.push({
          kind: "jsx-expression",
          braceDepth: 0,
          line: startLine,
          column: startColumn,
        });
        continue;
      }
      // Element children are text. An apostrophe in `<p>It's ready</p>`, the
      // slash in a URL, and a stray `<` in `<p>3 < 4</p>` must not open a
      // string, a regex literal, or a nested element here.
      advance(character);
      continue;
    }
    if (frame?.kind === "jsx" && frame.mode === "closing") {
      if (character === ">") {
        emitPunctuation(">");
        frames.pop();
        continue;
      }
      if (JSX_NAME_START.test(character)) {
        emitJsxName();
        continue;
      }
      advance(character);
      continue;
    }
    // Attribute values and comments inside an opening tag are lexed by the
    // shared string and comment branches below; everything else is JSX syntax.
    if (
      frame?.kind === "jsx" && frame.mode === "tag" &&
      character !== "'" && character !== '"' &&
      !(character === "/" && (next === "/" || next === "*"))
    ) {
      if (character === "/" && next === ">") {
        emitPunctuation("/");
        emitPunctuation(">");
        frames.pop();
        continue;
      }
      if (character === "<") {
        emitPunctuation("<");
        frame.angleDepth += 1;
        continue;
      }
      if (character === ">") {
        emitPunctuation(">");
        if (frame.angleDepth > 0) frame.angleDepth -= 1;
        else frame.mode = "children";
        continue;
      }
      if (character === "{") {
        emitPunctuation("{");
        frames.push({
          kind: "jsx-expression",
          braceDepth: 0,
          line: startLine,
          column: startColumn,
        });
        continue;
      }
      if (/\s/u.test(character)) {
        advance(character);
        continue;
      }
      if (JSX_NAME_START.test(character)) {
        emitJsxName();
        continue;
      }
      emitPunctuation(character);
      continue;
    }
    if (frame?.kind === "jsx-expression") {
      if (character === "{") frame.braceDepth += 1;
      else if (character === "}") {
        if (frame.braceDepth === 0) {
          emitPunctuation("}");
          frames.pop();
          continue;
        }
        frame.braceDepth -= 1;
      }
    }
    if (/\s/u.test(character)) {
      advance(character);
      continue;
    }
    // A leading `#!` line is not JavaScript. Without skipping it the `/` in
    // `#!/usr/bin/env node` opens a regex literal that swallows the newline and
    // desynchronizes every later string boundary in the file.
    if (language === "javascript" && start === 0 && character === "#" && next === "!") {
      while (offset < source.length && source[offset] !== "\n") advance(source[offset] as string);
      continue;
    }
    if (
      (language === "python" && character === "#") ||
      (language === "hcl" && character === "#") ||
      (language !== "python" && character === "/" && next === "/")
    ) {
      while (offset < source.length && source[offset] !== "\n") advance(source[offset] as string);
      continue;
    }
    if (language !== "python" && character === "/" && next === "*") {
      let closed = false;
      advance(character);
      advance(next);
      while (offset < source.length) {
        const current = source[offset] as string;
        if (current === "*" && source[offset + 1] === "/") {
          advance(current);
          advance("/");
          closed = true;
          break;
        }
        advance(current);
      }
      if (!closed) {
        reportIssue({ kind: "unterminated-block-comment", line: startLine, column: startColumn });
      }
      continue;
    }
    if (language === "javascript" && character === "/" && regexLiteralAllowed(tokens)) {
      // A regex literal may contain quotes (`x.replace(/"/g, "")`). Without
      // consuming it here those quotes would open a phantom string and
      // desynchronize every later string boundary in the file.
      advance(character);
      let escaped = false;
      let inClass = false;
      let closed = false;
      while (offset < source.length) {
        const current = source[offset] as string;
        if (current === "\n") break;
        advance(current);
        if (escaped) {
          escaped = false;
          continue;
        }
        if (current === "\\") escaped = true;
        else if (current === "[") inClass = true;
        else if (current === "]") inClass = false;
        else if (current === "/" && !inClass) {
          closed = true;
          break;
        }
      }
      if (closed) {
        while (offset < source.length && /[a-z]/u.test(source[offset] as string)) {
          advance(source[offset] as string);
        }
      } else {
        reportIssue({
          kind: "unterminated-regex-literal",
          line: startLine,
          column: startColumn,
        });
      }
      continue;
    }
    if (language === "javascript" && character === "`") {
      const template = consumeJavascriptTemplate();
      const raw = source.slice(start, offset);
      const decoded = template.dynamic
        ? { value: raw.slice(1, template.closed ? -1 : undefined), invalidUnicodeEscape: false }
        : decodeStringContent(raw, 1, template.closed);
      if (!template.closed) {
        reportIssue({
          kind: "unterminated-string-literal",
          line: startLine,
          column: startColumn,
        });
      } else if (decoded.invalidUnicodeEscape) {
        reportIssue({
          kind: "invalid-unicode-escape",
          line: startLine,
          column: startColumn,
        });
      }
      tokens.push({
        kind: "string",
        value: decoded.value,
        raw,
        offset: start,
        line: startLine,
        column: startColumn,
        static: template.closed && !template.dynamic,
      });
      continue;
    }
    if (character === "'" || character === '"') {
      // A JSX attribute value is text, not a JavaScript string: it may span
      // lines, as an SVG `values="0 0 0\n0 0 0"` matrix does, and a backslash
      // in it is literal rather than an escape.
      const jsxAttribute = frame?.kind === "jsx" && frame.mode === "tag";
      const triple =
        language === "python" && source.slice(offset, offset + 3) === character.repeat(3);
      const quoteLength = triple ? 3 : 1;
      const multiline = triple || jsxAttribute;
      for (let count = 0; count < quoteLength; count += 1) advance(character);
      let escaped = false;
      let dynamic = false;
      let closed = false;
      while (offset < source.length) {
        if (source.slice(offset, offset + quoteLength) === character.repeat(quoteLength) && !escaped) {
          for (let count = 0; count < quoteLength; count += 1) advance(character);
          closed = true;
          break;
        }
        const current = source[offset] as string;
        if (current === "\n" && !multiline && !escaped) {
          reportIssue({
            kind: "unterminated-string-literal",
            line: startLine,
            column: startColumn,
          });
          break;
        }
        if (
          language === "hcl" &&
          (current === "$" || current === "%") &&
          source[offset + 1] === "{"
        ) {
          dynamic = true;
        }
        advance(current);
        if (escaped) escaped = false;
        else if (current === "\\" && !jsxAttribute) escaped = true;
      }
      const raw = source.slice(start, offset);
      const decoded = decodeStringContent(raw, quoteLength, closed);
      if (!closed) {
        reportIssue({
          kind: "unterminated-string-literal",
          line: startLine,
          column: startColumn,
        });
      } else if (decoded.invalidUnicodeEscape) {
        reportIssue({
          kind: "invalid-unicode-escape",
          line: startLine,
          column: startColumn,
        });
      }
      tokens.push({
        kind: "string",
        value: decoded.value,
        raw,
        offset: start,
        line: startLine,
        column: startColumn,
        static: closed && !dynamic,
      });
      continue;
    }
    if (/[$_\p{L}]/u.test(character)) {
      advance(character);
      while (offset < source.length && /[$_\p{L}\p{N}]/u.test(source[offset] as string)) {
        advance(source[offset] as string);
      }
      const raw = source.slice(start, offset);
      tokens.push({
        kind: "identifier",
        value: raw,
        raw,
        offset: start,
        line: startLine,
        column: startColumn,
        static: true,
      });
      continue;
    }
    if (jsx && character === "<" && jsxElementAllowed(tokens, source, offset)) {
      emitPunctuation("<");
      frames.push({
        kind: "jsx",
        mode: "tag",
        angleDepth: 0,
        line: startLine,
        column: startColumn,
      });
      continue;
    }
    const pair = source.slice(offset, offset + 2);
    const punctuation = [
      "??",
      "=>",
      "==",
      "!=",
      "<=",
      ">=",
      "?.",
      "::",
      "++",
      "--",
      "**",
      "&&",
      "||",
      "+=",
      "-=",
      "*=",
      "/=",
      "%=",
      "&=",
      "|=",
      "^=",
    ].includes(pair)
      ? pair
      : character;
    for (const part of punctuation) advance(part);
    tokens.push({
      kind: "punctuation",
      value: punctuation,
      raw: punctuation,
      offset: start,
      line: startLine,
      column: startColumn,
      static: true,
    });
  }
  const unterminatedFrame = frames.at(-1);
  if (unterminatedFrame !== undefined) {
    reportIssue({
      kind: "mismatched-delimiter",
      line: unterminatedFrame.line,
      column: unterminatedFrame.column,
    });
  }
  if (issue === undefined) {
    const stack: Token[] = [];
    const closingToOpening = new Map([
      [")", "("],
      ["]", "["],
      ["}", "{"],
    ]);
    for (const token of tokens) {
      const value = structuralValue(token);
      if (value === "(" || value === "[" || value === "{") {
        stack.push(token);
        continue;
      }
      const expected = value === null ? undefined : closingToOpening.get(value);
      if (expected === undefined) continue;
      if (structuralValue(stack.at(-1)) !== expected) {
        reportIssue({ kind: "mismatched-delimiter", line: token.line, column: token.column });
        break;
      }
      stack.pop();
    }
    const unmatched = stack.at(-1);
    if (issue === undefined && unmatched !== undefined) {
      reportIssue({
        kind: "mismatched-delimiter",
        line: unmatched.line,
        column: unmatched.column,
      });
    }
  }
  return issue === undefined ? { tokens } : { tokens, issue };
}

/**
 * The syntactic value of a token. String literals return null: their decoded
 * contents are data, so a literal such as `")"` must never be counted as
 * punctuation when tracking bracket depth.
 */
function structuralValue(token: Token | undefined): string | null {
  if (token === undefined || token.kind === "string") return null;
  return token.value;
}

function isIdentifier(token: Token | undefined, value: string): boolean {
  return token?.kind === "identifier" && token.value === value;
}

/**
 * Whether the token at `index` names `property` as an object key. Identifiers
 * always qualify; a string literal only qualifies in key position, so a value
 * such as `flag ? "model" : "other"` is not mistaken for a `model:` key.
 */
function isPropertyNameAt(tokens: readonly Token[], index: number, property: string): boolean {
  const token = tokens[index];
  if (token === undefined || token.value !== property) return false;
  if (token.kind !== "identifier" && token.kind !== "string") return false;
  const previousToken = tokens[index - 1];
  const previous = structuralValue(tokens[index - 1]);
  return previousToken === undefined || previousToken.line < token.line || previous === "{" ||
    previous === "," || previous === "(";
}

function matchingIndex(
  tokens: readonly Token[],
  openIndex: number,
  open: string,
  close: string,
): number | null {
  let depth = 0;
  for (let index = openIndex; index < tokens.length; index += 1) {
    const value = structuralValue(tokens[index]);
    if (value === open) depth += 1;
    else if (value === close) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return null;
}

function matchingOpenIndex(
  tokens: readonly Token[],
  closeIndex: number,
  open: string,
  close: string,
): number | null {
  let depth = 0;
  for (let index = closeIndex; index >= 0; index -= 1) {
    const value = structuralValue(tokens[index]);
    if (value === close) depth += 1;
    else if (value === open) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return null;
}

/** Keywords whose parenthesised head is a condition or binder, not a parameter list. */
const PARENTHESISED_KEYWORDS = new Set([
  "if",
  "else",
  "while",
  "switch",
  "return",
  "typeof",
  "await",
  "yield",
  "in",
  "of",
  "new",
  "delete",
  "void",
  "throw",
  "do",
  "case",
]);

/**
 * Locally bound names that must not be trusted as an import. A caller-supplied
 * `openai` is a different provider from the imported one, so every form that
 * introduces such a name has to be recognized: `function`/`def` declarations and
 * expressions, arrows, class and object-literal methods, and the `for (const x of
 * …)` and `catch (x)` binders. Destructured parameters count too, because
 * `({ openai }) => …` names the injected provider just as a positional parameter
 * does.
 */
function functionParameterNames(
  tokens: readonly Token[],
  language: "javascript" | "python",
): Set<string> {
  const names = new Set<string>();
  const inspect = (open: number, close: number): void => {
    let depth = 0;
    for (let index = open + 1; index < close; index += 1) {
      const value = structuralValue(tokens[index]);
      if (["(", "[", "{"].includes(value ?? "")) {
        depth += 1;
        continue;
      }
      if ([")", "]", "}"].includes(value ?? "")) {
        depth = Math.max(0, depth - 1);
        continue;
      }
      // Depth 1 covers a destructured parameter: `({ openai })` and `([openai])`
      // bind the same name a positional parameter would.
      if (depth > 1 || tokens[index]?.kind !== "identifier") continue;
      const previous = structuralValue(tokens[index - 1]);
      if (previous === "(" || previous === "," || previous === "{" || previous === "[") {
        names.add(value as string);
      }
    }
  };
  const inspectAt = (open: number): void => {
    if (structuralValue(tokens[open]) !== "(") return;
    const close = matchingIndex(tokens, open, "(", ")");
    if (close !== null) inspect(open, close);
  };
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const value = token?.value;
    if (token?.kind === "identifier" && (value === "function" || value === "def")) {
      // An anonymous `function (openai) {}` has no name token to skip.
      let open = tokens[index + 1]?.kind === "identifier" ? index + 2 : index + 1;
      while (open < Math.min(tokens.length, index + 12) && structuralValue(tokens[open]) !== "(") {
        open += 1;
      }
      inspectAt(open);
    }
    if (language !== "javascript") continue;
    if (isIdentifier(token, "catch") && structuralValue(tokens[index + 1]) === "(") {
      inspectAt(index + 1);
    }
    // `for (const openai of providers)` and `for (let openai in map)`.
    if (isIdentifier(token, "for") && structuralValue(tokens[index + 1]) === "(") {
      const close = matchingIndex(tokens, index + 1, "(", ")");
      for (let cursor = index + 2; close !== null && cursor < close; cursor += 1) {
        if (
          tokens[cursor]?.kind === "identifier" &&
          (isIdentifier(tokens[cursor - 1], "const") ||
            isIdentifier(tokens[cursor - 1], "let") ||
            isIdentifier(tokens[cursor - 1], "var"))
        ) {
          names.add(tokens[cursor]?.value as string);
        }
      }
    }
    // A method definition: `build(openai) {` in a class or object literal. The
    // trailing `{` is what separates it from an ordinary call.
    if (
      token?.kind === "identifier" &&
      token.jsx !== true &&
      !PARENTHESISED_KEYWORDS.has(value ?? "") &&
      structuralValue(tokens[index + 1]) === "(" &&
      structuralValue(tokens[index - 1]) !== "." &&
      structuralValue(tokens[index - 1]) !== "?."
    ) {
      const close = matchingIndex(tokens, index + 1, "(", ")");
      if (close !== null && structuralValue(tokens[close + 1]) === "{") {
        inspect(index + 1, close);
      }
    }
    if (structuralValue(token) !== "=>") continue;
    if (tokens[index - 1]?.kind === "identifier") {
      names.add(tokens[index - 1]?.value as string);
    } else if (structuralValue(tokens[index - 1]) === ")") {
      const open = matchingOpenIndex(tokens, index - 1, "(", ")");
      if (open !== null) inspect(open, index - 1);
    }
  }
  return names;
}

const DIRECT_VALUE_TERMINATORS = new Set([",", ")", "}", "]", ";"]);

function isCompleteDirectValue(
  tokens: readonly Token[],
  valueIndex: number,
  allowLineBoundary = false,
): boolean {
  const value = tokens[valueIndex];
  const next = tokens[valueIndex + 1];
  if (value === undefined || next === undefined) return value !== undefined;
  if (DIRECT_VALUE_TERMINATORS.has(next.value)) return true;
  return allowLineBoundary && next.line > value.line;
}

function collectConstants(tokens: readonly Token[], language: "javascript" | "python"): Map<string, string> {
  const candidates = new Map<string, string | null>();
  const record = (name: string, value: string): void => {
    candidates.set(name, candidates.has(name) ? null : value);
  };
  let braceDepth = 0;
  for (let index = 0; index < tokens.length; index += 1) {
    if (language === "javascript") {
      if (structuralValue(tokens[index]) === "{") {
        braceDepth += 1;
        continue;
      }
      if (structuralValue(tokens[index]) === "}") {
        braceDepth = Math.max(0, braceDepth - 1);
        continue;
      }
      if (
        braceDepth === 0 &&
        isIdentifier(tokens[index], "const") &&
        tokens[index + 1]?.kind === "identifier" &&
        tokens[index + 2]?.value === "=" &&
        tokens[index + 3]?.kind === "string" &&
        tokens[index + 3]?.static &&
        isCompleteDirectValue(tokens, index + 3, true)
      ) {
        record(tokens[index + 1]?.value as string, tokens[index + 3]?.value as string);
      }
      continue;
    }
    const token = tokens[index];
    if (
      token?.kind === "identifier" &&
      token.column === 1 &&
      structuralValue(tokens[index + 1]) === "=" &&
      tokens[index + 2]?.kind === "string" &&
      tokens[index + 2]?.static &&
      isCompleteDirectValue(tokens, index + 2, true)
    ) {
      record(token.value, tokens[index + 2]?.value as string);
    }
  }
  const shadowed = functionParameterNames(tokens, language);
  const assignmentCounts = new Map<string, number>();
  for (let index = 0; index < tokens.length - 1; index += 1) {
    const token = tokens[index];
    if (token?.kind === "identifier" && tokens[index + 1]?.value === "=") {
      assignmentCounts.set(token.value, (assignmentCounts.get(token.value) ?? 0) + 1);
    }
  }
  return new Map(
    [...candidates.entries()].filter(
      (entry): entry is [string, string] =>
        entry[1] !== null &&
        !shadowed.has(entry[0]) &&
        (assignmentCounts.get(entry[0]) ?? 0) === 1,
    ),
  );
}

function staticAtom(
  tokens: readonly Token[],
  valueIndex: number,
  constants: ReadonlyMap<string, string>,
): { modelId: string; trace: EvidenceFact["resolutionTrace"] } | undefined {
  if (!isCompleteDirectValue(tokens, valueIndex)) return undefined;
  const token = tokens[valueIndex];
  if (token?.kind === "string" && token.static) {
    return {
      modelId: token.value,
      trace: [{ kind: "detector", detail: "direct static string" }],
    };
  }
  if (token?.kind === "identifier") {
    const constant = constants.get(token.value);
    if (constant !== undefined) {
      return {
        modelId: constant,
        trace: [{ kind: "constant", detail: `same-file constant ${token.value}` }],
      };
    }
  }
  return undefined;
}

function resolveTokenValue(
  tokens: readonly Token[],
  valueIndex: number,
  constants: ReadonlyMap<string, string>,
  defaultSelectorKind: ModelSelectorKind,
  environmentReference?: EnvironmentReference,
): ResolvedValue {
  const token = tokens[valueIndex];
  if (environmentReference !== undefined) {
    const fallback = environmentReference.fallbackIndex === undefined
      ? undefined
      : staticAtom(tokens, environmentReference.fallbackIndex, constants);
    if (fallback !== undefined) {
      return {
        rawValue: fallback.modelId,
        modelId: fallback.modelId,
        modelResolution: "resolved",
        selectorKind: "dynamic",
        trace: [
          {
            kind: "environment-fallback",
            detail: "static fallback for a runtime environment selector",
          },
          ...fallback.trace,
        ],
        environmentVariable: environmentReference.variable,
      };
    }
    return {
      rawValue: `environment:${environmentReference.variable}`,
      modelResolution: "dynamic",
      selectorKind: "dynamic",
      trace: [
        {
          kind: "environment-fallback",
          detail: `runtime environment variable ${environmentReference.variable}`,
        },
      ],
      environmentVariable: environmentReference.variable,
    };
  }
  const resolved = staticAtom(tokens, valueIndex, constants);
  if (resolved !== undefined) {
    return {
      rawValue: token?.kind === "identifier" ? token.value : resolved.modelId,
      modelId: resolved.modelId,
      modelResolution: "resolved",
      selectorKind: defaultSelectorKind,
      trace: resolved.trace,
    };
  }
  return {
    rawValue: token?.raw ?? "<missing>",
    modelResolution: token === undefined ? "unresolved" : "dynamic",
    selectorKind: "dynamic",
    trace: [{ kind: "detector", detail: "runtime-computed selector" }],
  };
}

type ImportedConstructor = {
  integration: ClientBinding["integration"];
  canonicalName: string;
};

type ImportProvenance = {
  constructors: Map<string, ImportedConstructor>;
  awsCommands: Map<string, string>;
  googleNamespaces: Set<string>;
  boto3Namespaces: Set<string>;
  pythonOsNamespaces: Set<string>;
  pythonGetenvFunctions: Set<string>;
  pythonEnvironObjects: Set<string>;
  moduleSpecifiers: Set<string>;
  aiSdkInstances: Map<string, AiSdkProvider>;
  aiSdkFactories: Map<string, AiSdkProvider>;
};

/**
 * A framework module prefix and the import syntax it can legally appear in. The
 * match forms differ per ecosystem, and a prefix published in only one of them
 * must not match the other: `ai` is an npm distribution, so a Python `import
 * ai.utils` or `ai_helpers` names a local package, not the Vercel AI SDK.
 */
type FrameworkModulePrefix = {
  prefix: string;
  ecosystem: "npm" | "python";
};

type UnsupportedFramework = {
  frameworkId: string;
  displayName: string;
  modulePrefixes: readonly FrameworkModulePrefix[];
  /**
   * `partial` means published rules cover this framework's common shapes, so the
   * notice fires only for a specifier none of them resolved. `none` means no
   * rule exists and every model choice degrades to lexical fallback.
   */
  semanticSupport: "partial" | "none";
  /** Rule-ID prefix that counts as having understood this framework. */
  rulePrefix?: string;
};

const npmPrefix = (prefix: string): FrameworkModulePrefix => ({ prefix, ecosystem: "npm" });
const pythonPrefix = (prefix: string): FrameworkModulePrefix => ({ prefix, ecosystem: "python" });

/**
 * Integrations that route model selection through their own abstraction. Where
 * no rule matches, model choices reach the assessment through bounded lexical
 * fallback only, so the gap is reported instead of left silent.
 */
const UNSUPPORTED_INTEGRATION_FRAMEWORKS: readonly UnsupportedFramework[] = Object.freeze([
  Object.freeze({
    frameworkId: "vercel-ai-sdk",
    displayName: "The Vercel AI SDK",
    modulePrefixes: Object.freeze([npmPrefix("ai"), npmPrefix("@ai-sdk")]),
    semanticSupport: "partial" as const,
    rulePrefix: "source.ts.vercel-ai-sdk.",
  }),
  Object.freeze({
    frameworkId: "langchain",
    displayName: "LangChain",
    modulePrefixes: Object.freeze([
      npmPrefix("langchain"),
      npmPrefix("@langchain"),
      pythonPrefix("langchain"),
    ]),
    semanticSupport: "none" as const,
  }),
  Object.freeze({
    frameworkId: "llamaindex",
    displayName: "LlamaIndex",
    modulePrefixes: Object.freeze([
      npmPrefix("llamaindex"),
      npmPrefix("@llamaindex"),
      pythonPrefix("llama_index"),
    ]),
    semanticSupport: "none" as const,
  }),
  Object.freeze({
    frameworkId: "litellm",
    displayName: "LiteLLM",
    modulePrefixes: Object.freeze([npmPrefix("litellm"), pythonPrefix("litellm")]),
    semanticSupport: "none" as const,
  }),
  Object.freeze({
    frameworkId: "google-generative-ai-legacy",
    displayName: "The legacy Google Generative AI SDK",
    modulePrefixes: Object.freeze([
      npmPrefix("@google/generative-ai"),
      pythonPrefix("google.generativeai"),
    ]),
    semanticSupport: "none" as const,
  }),
  Object.freeze({
    frameworkId: "vertex-ai-generative-legacy",
    displayName: "The retired Vertex AI generative SDK module",
    modulePrefixes: Object.freeze([
      npmPrefix("@google-cloud/vertexai"),
      pythonPrefix("vertexai"),
    ]),
    semanticSupport: "none" as const,
  }),
]);

/**
 * Whether an import specifier from `language` names a framework module. An npm
 * prefix matches the bare specifier or a subpath (`@ai-sdk/openai`); a Python
 * prefix also matches a dotted submodule (`llama_index.llms`) or an underscored
 * sibling distribution (`langchain_openai`). The forms are kept apart because
 * the underscored and dotted spellings are Python packaging conventions: applied
 * to an npm-only prefix they would claim every local `ai/` package and every
 * `ai_*` module for the Vercel AI SDK.
 */
function unsupportedFrameworkForModule(
  specifier: string,
  language: "javascript" | "python",
): UnsupportedFramework | undefined {
  const ecosystem = language === "javascript" ? "npm" : "python";
  for (const framework of UNSUPPORTED_INTEGRATION_FRAMEWORKS) {
    for (const { prefix, ecosystem: prefixEcosystem } of framework.modulePrefixes) {
      if (prefixEcosystem !== ecosystem) continue;
      if (specifier === prefix) return framework;
      if (ecosystem === "npm" ? specifier.startsWith(`${prefix}/`) : false) return framework;
      if (
        ecosystem === "python" &&
        (specifier.startsWith(`${prefix}.`) || specifier.startsWith(`${prefix}_`))
      ) {
        return framework;
      }
    }
  }
  return undefined;
}

/**
 * Framework imports in one file that no published rule read. Suppression is per
 * specifier rather than per framework: a resolved `@ai-sdk/openai` call says
 * nothing about an `@ai-sdk/mistral` import beside it, and collapsing both into
 * one framework id would let the supported provider buy silence for the
 * unsupported one. A specifier the provider table recognizes is understood only
 * when that provider's own rule produced a fact; a specifier under the framework
 * prefix that the table does not recognize is never understood.
 *
 * `facade` marks a specifier that selects no model on its own — the `ai` package
 * exports `generateText`, `tool`, and `wrapLanguageModel`, and the model reaches
 * them from a provider call that may live in another file. `detectSnapshot`
 * resolves those against the whole snapshot rather than one file.
 */
function unsupportedFrameworkImports(
  specifiers: ReadonlySet<string>,
  facts: readonly EvidenceFact[],
  language: "javascript" | "python",
): Array<{ frameworkId: string; facade: boolean }> {
  const facadeById = new Map<string, boolean>();
  for (const specifier of specifiers) {
    const framework = unsupportedFrameworkForModule(specifier, language);
    if (framework === undefined) continue;
    const provider = AI_SDK_PROVIDER_BY_MODULE.get(specifier);
    if (provider !== undefined) {
      const ruleId = aiSdkRuleId(provider);
      if (facts.some((fact) => fact.detectorRuleId === ruleId)) continue;
    }
    // Only the framework's own entrypoints are a façade; a provider package
    // names a platform, so an unread one is a gap wherever it appears.
    const facade = framework.semanticSupport === "partial" &&
      provider === undefined &&
      !specifier.startsWith("@");
    facadeById.set(
      framework.frameworkId,
      (facadeById.get(framework.frameworkId) ?? true) && facade,
    );
  }
  return [...facadeById].map(([frameworkId, facade]) => ({ frameworkId, facade }));
}

const CONSTRUCTORS_BY_MODULE: Readonly<Record<string, Readonly<Record<string, ClientBinding["integration"]>>>> = {
  openai: {
    OpenAI: "openai",
    AsyncOpenAI: "openai",
    AzureOpenAI: "openai",
    AsyncAzureOpenAI: "openai",
  },
  "@anthropic-ai/sdk": { Anthropic: "anthropic", AsyncAnthropic: "anthropic" },
  anthropic: { Anthropic: "anthropic", AsyncAnthropic: "anthropic" },
  "@google/genai": { GoogleGenAI: "google" },
  "@aws-sdk/client-bedrock-runtime": { BedrockRuntimeClient: "aws-bedrock" },
};

const DEFAULT_CONSTRUCTOR_BY_MODULE: Readonly<Record<string, string>> = {
  openai: "OpenAI",
  "@anthropic-ai/sdk": "Anthropic",
};

const AWS_COMMANDS = new Set([
  "InvokeModelCommand",
  "InvokeModelWithResponseStreamCommand",
  "ConverseCommand",
  "ConverseStreamCommand",
]);

type AiSdkProvider = {
  /** Rule-ID segment, and the qualified provider package identity. */
  providerId: string;
  module: string;
  integration: ClientBinding["integration"];
  platform: string;
  /**
   * Azure names a deployment and Bedrock accepts profiles and ARNs, exactly as
   * in the official-SDK rules, so neither selector is an exact model ID.
   */
  selectorKind: ModelSelectorKind;
  /** Exported provider instances, including the package's own aliases. */
  instanceNames: readonly string[];
  /** Exported provider factories, including the package's own aliases. */
  factoryNames: readonly string[];
};

/**
 * Vercel AI SDK provider packages. The package pins the serving platform, and a
 * provider call's first positional argument is the model selector, so these are
 * exact rules rather than generic framework matching. Instance and factory
 * names are taken from each package's published type surface.
 */
const AI_SDK_PROVIDERS: readonly AiSdkProvider[] = Object.freeze([
  Object.freeze({
    providerId: "openai",
    module: "@ai-sdk/openai",
    integration: "openai" as const,
    platform: "openai",
    selectorKind: "model-id" as const,
    instanceNames: Object.freeze(["openai"]),
    factoryNames: Object.freeze(["createOpenAI"]),
  }),
  Object.freeze({
    providerId: "azure",
    module: "@ai-sdk/azure",
    integration: "openai" as const,
    platform: "azure",
    selectorKind: "deployment-name" as const,
    instanceNames: Object.freeze(["azure"]),
    factoryNames: Object.freeze(["createAzure"]),
  }),
  Object.freeze({
    providerId: "anthropic",
    module: "@ai-sdk/anthropic",
    integration: "anthropic" as const,
    platform: "anthropic",
    selectorKind: "model-id" as const,
    instanceNames: Object.freeze(["anthropic"]),
    factoryNames: Object.freeze(["createAnthropic"]),
  }),
  Object.freeze({
    providerId: "google",
    module: "@ai-sdk/google",
    integration: "google" as const,
    platform: "google",
    selectorKind: "model-id" as const,
    instanceNames: Object.freeze(["google"]),
    factoryNames: Object.freeze(["createGoogle", "createGoogleGenerativeAI"]),
  }),
  Object.freeze({
    providerId: "google-vertex",
    module: "@ai-sdk/google-vertex",
    integration: "google" as const,
    platform: "google-vertex",
    selectorKind: "model-id" as const,
    instanceNames: Object.freeze(["googleVertex", "vertex"]),
    factoryNames: Object.freeze(["createGoogleVertex", "createVertex"]),
  }),
  Object.freeze({
    providerId: "amazon-bedrock",
    module: "@ai-sdk/amazon-bedrock",
    integration: "aws-bedrock" as const,
    platform: "aws-bedrock",
    selectorKind: "polymorphic" as const,
    instanceNames: Object.freeze(["amazonBedrock", "bedrock"]),
    factoryNames: Object.freeze(["createAmazonBedrock"]),
  }),
]);

/**
 * Provider members whose first positional argument is a model selector. An
 * allowlist keeps an unrecognized future member a reported gap rather than a
 * guessed model ID; `tools`, `files`, and `skills` are not model factories.
 */
const AI_SDK_MODEL_METHODS: ReadonlySet<string> = new Set([
  "languageModel",
  "chat",
  "messages",
  "responses",
  "completion",
  "deepseek",
  "generativeAI",
  "interactions",
  "embedding",
  "embeddingModel",
  "textEmbedding",
  "textEmbeddingModel",
  "image",
  "imageModel",
  "video",
  "videoModel",
  "speech",
  "speechModel",
  "speechTranslationModel",
  "transcription",
  "transcriptionModel",
  "translation",
  "reranking",
  "rerankingModel",
  "experimental_realtime",
]);

const AI_SDK_PROVIDER_BY_MODULE = new Map(
  AI_SDK_PROVIDERS.map((provider) => [provider.module, provider] as const),
);

function aiSdkRuleId(provider: AiSdkProvider): string {
  return `source.ts.vercel-ai-sdk.${provider.providerId}-model@1`;
}

/**
 * Whether `index` names a variable being assigned rather than a property or a
 * JSX attribute. `flags.openai = true` and `<Row openai="x" />` both put the
 * identifier immediately before an `=`, so without this the provider names an
 * import registered — which are ordinary object keys and React props — would
 * read as reassignments and discard the import for the whole file.
 */
function isBareAssignmentTarget(tokens: readonly Token[], index: number): boolean {
  if (tokens[index]?.jsx === true) return false;
  const previous = structuralValue(tokens[index - 1]);
  return previous !== "." && previous !== "?.";
}

/**
 * Whether the import clause between `importIndex` and `fromIndex` binds at least
 * one runtime value. `import { type A, type B } from "m"` binds none — TypeScript
 * erases the whole statement — so it reaches no module and selects no model, just
 * like the statement-level `import type { A } from "m"` spelling.
 */
function importsAnyValue(
  tokens: readonly Token[],
  importIndex: number,
  fromIndex: number,
): boolean {
  const open = tokens.findIndex(
    (token, index) =>
      index > importIndex && index < fromIndex && structuralValue(token) === "{",
  );
  const clauseEnd = open >= 0 ? open : fromIndex;
  for (let index = importIndex + 1; index < clauseEnd; index += 1) {
    const token = tokens[index];
    if (token?.kind !== "identifier") continue;
    if (token.value !== "type" && token.value !== "as") return true;
  }
  if (open < 0) return true; // a namespace, default, or side-effect-only import
  const close = matchingIndex(tokens, open, "{", "}");
  if (close === null || close > fromIndex) return true;
  let named = 0;
  for (let index = open + 1; index < close; index += 1) {
    const token = tokens[index];
    if (token?.kind !== "identifier") continue;
    if (token.value === "type") {
      index += 1;
      continue;
    }
    named += 1;
    if (tokens[index + 1]?.value === "as") index += 2;
  }
  // `import {} from "m"` binds nothing but still evaluates the module.
  return named > 0 || open + 1 === close;
}

function importProvenance(
  tokens: readonly Token[],
  language: "javascript" | "python",
): ImportProvenance {
  const constructors = new Map<string, ImportedConstructor>();
  const awsCommands = new Map<string, string>();
  const googleNamespaces = new Set<string>();
  const boto3Namespaces = new Set<string>();
  const pythonOsNamespaces = new Set<string>();
  const pythonGetenvFunctions = new Set<string>();
  const pythonEnvironObjects = new Set<string>();
  const moduleSpecifiers = new Set<string>();
  const aiSdkInstances = new Map<string, AiSdkProvider>();
  const aiSdkFactories = new Map<string, AiSdkProvider>();
  const conflicted = new Set<string>();
  const addAiSdkImport = (moduleName: string, canonicalName: string, localName: string): void => {
    const provider = AI_SDK_PROVIDER_BY_MODULE.get(moduleName);
    if (provider === undefined || conflicted.has(localName)) return;
    const kind = provider.instanceNames.includes(canonicalName)
      ? "instance"
      : provider.factoryNames.includes(canonicalName)
      ? "factory"
      : undefined;
    if (kind === undefined) return;
    // Two provider packages under one local name would otherwise resolve
    // last-wins and date a call against whichever import came second.
    const existingInstance = aiSdkInstances.get(localName);
    const existingFactory = aiSdkFactories.get(localName);
    const existing = existingInstance ?? existingFactory;
    if (
      existing !== undefined &&
      (existing !== provider || (kind === "instance") !== (existingInstance !== undefined))
    ) {
      aiSdkInstances.delete(localName);
      aiSdkFactories.delete(localName);
      conflicted.add(localName);
      return;
    }
    if (kind === "instance") aiSdkInstances.set(localName, provider);
    else aiSdkFactories.set(localName, provider);
  };
  const addConstructor = (moduleName: string, canonicalName: string, localName: string): void => {
    const integration = CONSTRUCTORS_BY_MODULE[moduleName]?.[canonicalName];
    if (integration === undefined || conflicted.has(localName)) return;
    const existing = constructors.get(localName);
    if (
      existing !== undefined &&
      (existing.integration !== integration || existing.canonicalName !== canonicalName)
    ) {
      constructors.delete(localName);
      conflicted.add(localName);
      return;
    }
    constructors.set(localName, { integration, canonicalName });
  };
  const addNamedImport = (moduleName: string, canonicalName: string, localName: string): void => {
    addConstructor(moduleName, canonicalName, localName);
    addAiSdkImport(moduleName, canonicalName, localName);
    if (moduleName === "@aws-sdk/client-bedrock-runtime" && AWS_COMMANDS.has(canonicalName)) {
      awsCommands.set(localName, canonicalName);
    }
  };

  if (language === "javascript") {
    for (let index = 0; index < tokens.length; index += 1) {
      // `import("m")` and `export … from "m"` reach the module at runtime just
      // as a static import does, so both name a framework for coverage even
      // though neither binds a provider this pass can follow.
      if (
        isIdentifier(tokens[index], "import") &&
        structuralValue(tokens[index + 1]) === "(" &&
        tokens[index + 2]?.kind === "string"
      ) {
        moduleSpecifiers.add(tokens[index + 2]?.value as string);
        continue;
      }
      if (isIdentifier(tokens[index], "export") && tokens[index + 1]?.value !== "type") {
        for (let cursor = index + 1; cursor < Math.min(tokens.length, index + 80); cursor += 1) {
          if (
            structuralValue(tokens[cursor]) === ";" ||
            isIdentifier(tokens[cursor], "import") ||
            isIdentifier(tokens[cursor], "export")
          ) break;
          if (isIdentifier(tokens[cursor], "from") && tokens[cursor + 1]?.kind === "string") {
            moduleSpecifiers.add(tokens[cursor + 1]?.value as string);
            break;
          }
        }
      }
      if (isIdentifier(tokens[index], "import")) {
        let fromIndex = -1;
        let moduleIndex = -1;
        for (let cursor = index + 1; cursor < Math.min(tokens.length, index + 80); cursor += 1) {
          if (
            structuralValue(tokens[cursor]) === ";" ||
            isIdentifier(tokens[cursor], "import")
          ) break;
          if (isIdentifier(tokens[cursor], "from") && tokens[cursor + 1]?.kind === "string") {
            fromIndex = cursor;
            moduleIndex = cursor + 1;
            break;
          }
        }
        if (fromIndex < 0 || moduleIndex < 0) continue;
        const moduleName = tokens[moduleIndex]?.value as string;
        if (tokens[index + 1]?.value === "type") {
          index = moduleIndex;
          continue;
        }
        // Recorded after the type-only check: a discarded type import does not
        // select a model at runtime. An inline `{ type X }` modifier on every
        // specifier erases the import just as the statement-level form does.
        if (importsAnyValue(tokens, index, fromIndex)) moduleSpecifiers.add(moduleName);
        const defaultName = DEFAULT_CONSTRUCTOR_BY_MODULE[moduleName];
        const first = tokens[index + 1];
        if (defaultName !== undefined && first?.kind === "identifier" && first.value !== "type") {
          addConstructor(moduleName, defaultName, first.value);
        }
        const open = tokens.findIndex(
          (token, tokenIndex) =>
            tokenIndex > index && tokenIndex < fromIndex && structuralValue(token) === "{",
        );
        if (open >= 0) {
          const close = matchingIndex(tokens, open, "{", "}");
          if (close !== null && close < fromIndex) {
            for (let cursor = open + 1; cursor < close; cursor += 1) {
              const imported = tokens[cursor];
              if (imported?.kind !== "identifier") continue;
              if (imported.value === "type") {
                cursor += 1;
                continue;
              }
              const local = tokens[cursor + 1]?.value === "as" &&
                  tokens[cursor + 2]?.kind === "identifier"
                ? tokens[cursor + 2]?.value as string
                : imported.value;
              addNamedImport(moduleName, imported.value, local);
              if (local !== imported.value) cursor += 2;
            }
          }
        }
        index = moduleIndex;
        continue;
      }
      if (
        !isIdentifier(tokens[index], "require") ||
        tokens[index + 1]?.value !== "(" ||
        tokens[index + 2]?.kind !== "string" ||
        tokens[index + 3]?.value !== ")"
      ) {
        continue;
      }
      const moduleName = tokens[index + 2]?.value as string;
      moduleSpecifiers.add(moduleName);
      if (tokens[index - 1]?.value !== "=") continue;
      if (tokens[index - 2]?.kind === "identifier") {
        const defaultName = DEFAULT_CONSTRUCTOR_BY_MODULE[moduleName];
        if (defaultName !== undefined) {
          addConstructor(moduleName, defaultName, tokens[index - 2]?.value as string);
        }
        continue;
      }
      if (tokens[index - 2]?.value !== "}") continue;
      let open = index - 3;
      while (open >= 0 && tokens[open]?.value !== "{") open -= 1;
      if (open < 0) continue;
      for (let cursor = open + 1; cursor < index - 2; cursor += 1) {
        const imported = tokens[cursor];
        if (imported?.kind !== "identifier") continue;
        const local = tokens[cursor + 1]?.value === ":" &&
            tokens[cursor + 2]?.kind === "identifier"
          ? tokens[cursor + 2]?.value as string
          : imported.value;
        addNamedImport(moduleName, imported.value, local);
        if (local !== imported.value) cursor += 2;
      }
    }
  } else {
    for (let index = 0; index < tokens.length; index += 1) {
      if (isIdentifier(tokens[index], "from")) {
        let importIndex = index + 1;
        while (importIndex < tokens.length && !isIdentifier(tokens[importIndex], "import")) {
          if (tokens[importIndex]?.line !== tokens[index]?.line) break;
          importIndex += 1;
        }
        if (!isIdentifier(tokens[importIndex], "import")) continue;
        const moduleName = tokens
          .slice(index + 1, importIndex)
          .map((token) => token.value)
          .join("");
        moduleSpecifiers.add(moduleName);
        let cursor = importIndex + 1;
        while (cursor < tokens.length && tokens[cursor]?.line === tokens[importIndex]?.line) {
          const imported = tokens[cursor];
          if (imported?.kind !== "identifier") {
            cursor += 1;
            continue;
          }
          const local = tokens[cursor + 1]?.value === "as" &&
              tokens[cursor + 2]?.kind === "identifier"
            ? tokens[cursor + 2]?.value as string
            : imported.value;
          if (moduleName === "google" && imported.value === "genai") {
            googleNamespaces.add(local);
          } else if (moduleName === "os" && imported.value === "getenv") {
            pythonGetenvFunctions.add(local);
          } else if (moduleName === "os" && imported.value === "environ") {
            pythonEnvironObjects.add(local);
          } else {
            pythonGetenvFunctions.delete(local);
            pythonEnvironObjects.delete(local);
            addNamedImport(moduleName, imported.value, local);
          }
          cursor += local === imported.value ? 1 : 3;
        }
      } else if (isIdentifier(tokens[index], "import") && tokens[index + 1]?.kind === "identifier") {
        // `import a.b.c as x, d.e` names one dotted module per comma-separated
        // clause. The namespace checks below only need each first segment, but
        // framework matching needs the whole dotted path — and every clause, or
        // a framework imported anywhere but first goes unreported.
        const line = tokens[index]?.line;
        let cursor = index + 1;
        while (cursor < tokens.length && tokens[cursor]?.line === line) {
          const importedModule = tokens[cursor]?.value;
          if (tokens[cursor]?.kind !== "identifier" || importedModule === undefined) break;
          let dotted = importedModule;
          let scan = cursor + 1;
          while (tokens[scan]?.value === "." && tokens[scan + 1]?.kind === "identifier") {
            dotted += `.${tokens[scan + 1]?.value}`;
            scan += 2;
          }
          moduleSpecifiers.add(dotted);
          const local = tokens[scan]?.value === "as" && tokens[scan + 1]?.kind === "identifier"
            ? tokens[scan + 1]?.value as string
            : importedModule;
          if (importedModule === "boto3") boto3Namespaces.add(local);
          else if (importedModule === "os") pythonOsNamespaces.add(local);
          if (tokens[scan]?.value === "as") scan += 2;
          if (structuralValue(tokens[scan]) !== ",") break;
          cursor = scan + 1;
        }
        index = cursor;
      }
    }
  }
  const importedNames = new Set([
    ...constructors.keys(),
    ...awsCommands.keys(),
    ...googleNamespaces,
    ...boto3Namespaces,
    ...pythonOsNamespaces,
    ...pythonGetenvFunctions,
    ...pythonEnvironObjects,
    ...aiSdkInstances.keys(),
    ...aiSdkFactories.keys(),
  ]);
  const shadowed = new Set<string>();
  for (const name of functionParameterNames(tokens, language)) {
    if (importedNames.has(name)) shadowed.add(name);
  }
  const inspectParameters = (open: number, close: number): void => {
    let depth = 0;
    for (let index = open + 1; index < close; index += 1) {
      const value = structuralValue(tokens[index]);
      if (["(", "[", "{"].includes(value ?? "")) depth += 1;
      else if ([")", "]", "}"].includes(value ?? "")) depth = Math.max(0, depth - 1);
      if (
        depth === 0 &&
        tokens[index]?.kind === "identifier" &&
        importedNames.has(value ?? "") &&
        (structuralValue(tokens[index - 1]) === "(" ||
          structuralValue(tokens[index - 1]) === ",")
      ) {
        shadowed.add(value as string);
      }
    }
  };
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const value = token?.value;
    if (
      token?.kind === "identifier" &&
      (value === "function" || value === "def") &&
      tokens[index + 1]?.kind === "identifier"
    ) {
      let open = index + 2;
      while (open < Math.min(tokens.length, index + 12) && structuralValue(tokens[open]) !== "(") {
        open += 1;
      }
      if (structuralValue(tokens[open]) === "(") {
        const close = matchingIndex(tokens, open, "(", ")");
        if (close !== null) inspectParameters(open, close);
      }
    }
    if (language === "javascript" && structuralValue(token) === "=>") {
      if (tokens[index - 1]?.kind === "identifier" && importedNames.has(tokens[index - 1]?.value ?? "")) {
        shadowed.add(tokens[index - 1]?.value as string);
      }
    }
    if (
      tokens[index]?.kind === "identifier" &&
      importedNames.has(value ?? "") &&
      tokens[index + 1]?.value === "=" &&
      isBareAssignmentTarget(tokens, index) &&
      !isIdentifier(tokens[index + 2], "require")
    ) {
      shadowed.add(value as string);
    }
    if (
      (isIdentifier(tokens[index - 1], "class") ||
        isIdentifier(tokens[index - 1], "function")) &&
      importedNames.has(value ?? "")
    ) {
      shadowed.add(value as string);
    }
  }
  for (const name of shadowed) {
    constructors.delete(name);
    awsCommands.delete(name);
    googleNamespaces.delete(name);
    boto3Namespaces.delete(name);
    pythonOsNamespaces.delete(name);
    pythonGetenvFunctions.delete(name);
    pythonEnvironObjects.delete(name);
    aiSdkInstances.delete(name);
    aiSdkFactories.delete(name);
  }
  return {
    constructors,
    awsCommands,
    googleNamespaces,
    boto3Namespaces,
    pythonOsNamespaces,
    pythonGetenvFunctions,
    pythonEnvironObjects,
    moduleSpecifiers,
    aiSdkInstances,
    aiSdkFactories,
  };
}

function chainBefore(tokens: readonly Token[], openIndex: number): string[] {
  const chain: string[] = [];
  let index = openIndex - 1;
  if (tokens[index]?.kind !== "identifier") return chain;
  chain.unshift(tokens[index]?.value as string);
  index -= 1;
  while (index >= 1 && (tokens[index]?.value === "." || tokens[index]?.value === "?.")) {
    const identifier = tokens[index - 1];
    if (identifier?.kind !== "identifier") break;
    chain.unshift(identifier.value);
    index -= 2;
  }
  return chain;
}

function propertyValueIndex(
  tokens: readonly Token[],
  start: number,
  end: number,
  property: string,
  separator: ":" | "=",
): number | null {
  let braceDepth = 0;
  let bracketDepth = 0;
  let parenDepth = 0;
  for (let index = start; index < end - 1; index += 1) {
    const value = structuralValue(tokens[index]);
    if (
      braceDepth === 0 &&
      bracketDepth === 0 &&
      parenDepth === 0 &&
      isPropertyNameAt(tokens, index, property) &&
      structuralValue(tokens[index + 1]) === separator
    ) {
      return index + 2;
    }
    if (value === "{") braceDepth += 1;
    else if (value === "}") braceDepth = Math.max(0, braceDepth - 1);
    else if (value === "[") bracketDepth += 1;
    else if (value === "]") bracketDepth = Math.max(0, bracketDepth - 1);
    else if (value === "(") parenDepth += 1;
    else if (value === ")") parenDepth = Math.max(0, parenDepth - 1);
  }
  return null;
}

function directObjectPropertyValueIndex(
  tokens: readonly Token[],
  start: number,
  end: number,
  property: string,
  separator: ":" | "=",
): number | null {
  if (structuralValue(tokens[start]) !== "{") return null;
  let braceDepth = 0;
  let bracketDepth = 0;
  let parenDepth = 0;
  for (let index = start + 1; index < end - 1; index += 1) {
    const value = structuralValue(tokens[index]);
    if (value === "{") braceDepth += 1;
    else if (value === "}") {
      if (braceDepth === 0) break;
      braceDepth -= 1;
    } else if (value === "[") bracketDepth += 1;
    else if (value === "]") bracketDepth = Math.max(0, bracketDepth - 1);
    else if (value === "(") parenDepth += 1;
    else if (value === ")") parenDepth = Math.max(0, parenDepth - 1);
    if (
      braceDepth === 0 &&
      bracketDepth === 0 &&
      parenDepth === 0 &&
      isPropertyNameAt(tokens, index, property) &&
      structuralValue(tokens[index + 1]) === separator
    ) {
      return index + 2;
    }
  }
  return null;
}

function directArgumentPropertyValueIndex(
  tokens: readonly Token[],
  start: number,
  end: number,
  property: string,
  separator: ":" | "=",
  language: "javascript" | "python",
): number | null {
  if (language === "javascript") {
    return directObjectPropertyValueIndex(tokens, start, end, property, separator);
  }
  return propertyValueIndex(tokens, start, end, property, separator);
}

function constructorArguments(tokens: readonly Token[], classIndex: number): readonly Token[] {
  const open = classIndex + 1;
  if (structuralValue(tokens[open]) !== "(") return [];
  const close = matchingIndex(tokens, open, "(", ")");
  return close === null ? [] : tokens.slice(open + 1, close);
}

function recognizedEndpointPlatform(value: string): string | undefined {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return undefined;
  }
  if (parsed.protocol !== "https:" || parsed.username !== "" || parsed.password !== "") {
    return undefined;
  }
  const hostname = parsed.hostname.toLowerCase().replace(/\.$/u, "");
  if (hostname === "api.openai.com") return "openai";
  if (
    hostname.endsWith(".openai.azure.com") ||
    hostname.endsWith(".cognitiveservices.azure.com")
  ) {
    return "azure";
  }
  if (hostname === "api.anthropic.com") return "anthropic";
  if (hostname === "generativelanguage.googleapis.com") return "google";
  if (
    hostname === "aiplatform.googleapis.com" ||
    /^[a-z0-9-]+-aiplatform\.googleapis\.com$/u.test(hostname)
  ) {
    return "google-vertex";
  }
  if (
    /^bedrock-runtime(?:-fips)?\.[a-z0-9-]+\.amazonaws\.com(?:\.cn)?$/u.test(hostname)
  ) {
    return "aws-bedrock";
  }
  return undefined;
}

function endpointSignal(
  tokens: readonly Token[],
): { present: boolean; platform?: string; safe: boolean } {
  const endpointProperties = new Set([
    "baseURL",
    "baseUrl",
    "base_url",
    "endpoint",
    "endpoint_url",
    "azure_endpoint",
    "api_endpoint",
  ]);
  const indices: number[] = [];
  // The whole range is walked: a shorthand `{ baseURL }` ends two tokens before a
  // `baseURL: "…"` pair does, so a bound that reserved room for the value token
  // would step past exactly the case that has none.
  for (let index = 0; index < tokens.length; index += 1) {
    const property = tokens[index]?.value;
    if (
      property === undefined ||
      !endpointProperties.has(property) ||
      !isPropertyNameAt(tokens, index, property)
    ) {
      continue;
    }
    if (
      structuralValue(tokens[index + 1]) !== ":" &&
      structuralValue(tokens[index + 1]) !== "="
    ) {
      // A shorthand property (`{ baseURL }`) names an endpoint whose value this
      // pass cannot see, which is exactly the custom-or-computed case the
      // explicit spelling is rejected for.
      return { present: true, safe: false };
    }
    indices.push(index + 2);
  }
  if (indices.length === 0) return { present: false, safe: true };
  const platforms = new Set<string>();
  for (const index of indices) {
    const token = tokens[index];
    if (
      token?.kind !== "string" ||
      !token.static ||
      !isCompleteDirectValue(tokens, index)
    ) {
      return { present: true, safe: false };
    }
    const platform = recognizedEndpointPlatform(token.value);
    if (platform === undefined) return { present: true, safe: false };
    platforms.add(platform);
  }
  if (platforms.size !== 1) return { present: true, safe: false };
  const platform = platforms.values().next().value;
  return platform === undefined
    ? { present: true, safe: false }
    : { present: true, platform, safe: true };
}

function resolvedClientPlatform(input: {
  integration: ClientBinding["integration"];
  canonicalName: string;
  defaultPlatform?: string;
  arguments: readonly Token[];
  language: "javascript" | "python";
}): Pick<ClientBinding, "servingPlatform" | "platformResolution" | "endpointSafe"> {
  const endpoint = endpointSignal(input.arguments);
  if (!endpoint.safe) return { platformResolution: "unknown", endpointSafe: false };
  if (!endpoint.present) {
    return input.defaultPlatform === undefined
      ? { platformResolution: "ambiguous", endpointSafe: true }
      : {
          servingPlatform: input.defaultPlatform,
          platformResolution: "resolved",
          endpointSafe: true,
        };
  }
  const endpointPlatform = endpoint.platform as string;
  const acceptsEndpointOverride =
    input.integration === "openai" &&
    input.canonicalName === "OpenAI" &&
    (endpointPlatform === "openai" || endpointPlatform === "azure");
  if (acceptsEndpointOverride || endpointPlatform === input.defaultPlatform) {
    return {
      servingPlatform: endpointPlatform,
      platformResolution: "resolved",
      endpointSafe: true,
    };
  }
  return { platformResolution: "ambiguous", endpointSafe: false };
}

function clientBindings(
  tokens: readonly Token[],
  language: "javascript" | "python",
): { bindings: Map<string, ClientBinding>; imports: ImportProvenance } {
  const bindings = new Map<string, ClientBinding>();
  const imports = importProvenance(tokens, language);
  const conflictedBindings = new Set<string>();
  const setBinding = (binding: ClientBinding): void => {
    if (conflictedBindings.has(binding.variable)) return;
    const existing = bindings.get(binding.variable);
    if (existing !== undefined && JSON.stringify(existing) !== JSON.stringify(binding)) {
      bindings.delete(binding.variable);
      conflictedBindings.add(binding.variable);
      return;
    }
    bindings.set(binding.variable, binding);
  };

  const googlePlatform = (
    arguments_: readonly Token[],
  ): Pick<ClientBinding, "servingPlatform" | "platformResolution" | "endpointSafe"> => {
    const endpoint = endpointSignal(arguments_);
    if (!endpoint.safe) return { platformResolution: "unknown", endpointSafe: false };
    const separator = language === "javascript" ? ":" : "=";
    const vertexIndex = directArgumentPropertyValueIndex(
      arguments_,
      0,
      arguments_.length,
      "vertexai",
      separator,
      language,
    );
    const apiKeyIndex = directArgumentPropertyValueIndex(
      arguments_,
      0,
      arguments_.length,
      language === "javascript" ? "apiKey" : "api_key",
      separator,
      language,
    );
    const candidates = new Set<string>();
    if (vertexIndex !== null) {
      const valueToken = arguments_[vertexIndex];
      const value = valueToken?.kind === "identifier" ? valueToken.value : undefined;
      if (!isCompleteDirectValue(arguments_, vertexIndex)) {
        return { platformResolution: "ambiguous", endpointSafe: true };
      }
      if (value === "true" || value === "True") candidates.add("google-vertex");
      else if (value === "false" || value === "False") candidates.add("google");
      else return { platformResolution: "ambiguous", endpointSafe: true };
    }
    if (apiKeyIndex !== null) candidates.add("google");
    if (endpoint.present) {
      if (endpoint.platform !== "google" && endpoint.platform !== "google-vertex") {
        return { platformResolution: "ambiguous", endpointSafe: false };
      }
      candidates.add(endpoint.platform);
    }
    if (candidates.size !== 1) {
      return { platformResolution: "ambiguous", endpointSafe: true };
    }
    return {
      servingPlatform: candidates.values().next().value as string,
      platformResolution: "resolved",
      endpointSafe: true,
    };
  };

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const isNew = language === "javascript" && isIdentifier(token, "new");
    const classIndex = isNew ? index + 1 : index;
    const localClassName = tokens[classIndex]?.value;
    if (tokens[classIndex]?.kind !== "identifier" || localClassName === undefined) continue;
    const imported = imports.constructors.get(localClassName);
    if (imported === undefined) continue;
    let variable: string | undefined;
    if (isNew) {
      if (tokens[index - 1]?.value === "=" && tokens[index - 2]?.kind === "identifier") {
        variable = tokens[index - 2]?.value;
      }
    } else if (
      language === "python" &&
      tokens[index - 1]?.value === "=" &&
      tokens[index - 2]?.kind === "identifier"
    ) {
      variable = tokens[index - 2]?.value;
    }
    if (variable === undefined) continue;
    const arguments_ = constructorArguments(tokens, classIndex);
    if (imported.integration === "openai") {
      const platform = imported.canonicalName.includes("Azure")
        ? "azure"
        : "openai";
      const resolution = resolvedClientPlatform({
        integration: "openai",
        canonicalName: imported.canonicalName,
        defaultPlatform: platform,
        arguments: arguments_,
        language,
      });
      const selectorPlatform = resolution.servingPlatform ?? platform;
      setBinding({
        variable,
        integration: "openai",
        ...resolution,
        selectorKind:
          selectorPlatform === "azure"
            ? "deployment-name"
            : selectorPlatform === "aws-bedrock"
              ? "polymorphic"
              : "model-id",
      });
    } else if (imported.integration === "anthropic") {
      const resolution = resolvedClientPlatform({
        integration: "anthropic",
        canonicalName: imported.canonicalName,
        defaultPlatform: "anthropic",
        arguments: arguments_,
        language,
      });
      setBinding({
        variable,
        integration: "anthropic",
        ...resolution,
        selectorKind: "model-id",
      });
    } else if (imported.integration === "google") {
      setBinding({
        variable,
        integration: "google",
        ...googlePlatform(arguments_),
        selectorKind: "model-id",
      });
    } else if (imported.integration === "aws-bedrock") {
      const resolution = resolvedClientPlatform({
        integration: "aws-bedrock",
        canonicalName: imported.canonicalName,
        defaultPlatform: "aws-bedrock",
        arguments: arguments_,
        language,
      });
      setBinding({
        variable,
        integration: "aws-bedrock",
        ...resolution,
        selectorKind: "polymorphic",
      });
    }
  }

  if (language === "python") {
    for (let index = 0; index < tokens.length - 5; index += 1) {
      if (
        tokens[index]?.kind === "identifier" &&
        tokens[index + 1]?.value === "=" &&
        imports.googleNamespaces.has(tokens[index + 2]?.value ?? "") &&
        tokens[index + 3]?.value === "." &&
        tokens[index + 4]?.value === "Client" &&
        structuralValue(tokens[index + 5]) === "("
      ) {
        const close = matchingIndex(tokens, index + 5, "(", ")");
        const arguments_ = close === null ? [] : tokens.slice(index + 6, close);
        setBinding({
          variable: tokens[index]?.value as string,
          integration: "google",
          ...googlePlatform(arguments_),
          selectorKind: "model-id",
        });
      }
    }
    for (let index = 0; index < tokens.length - 6; index += 1) {
      if (
        tokens[index]?.kind === "identifier" &&
        tokens[index + 1]?.value === "=" &&
        imports.boto3Namespaces.has(tokens[index + 2]?.value ?? "") &&
        tokens[index + 3]?.value === "." &&
        tokens[index + 4]?.value === "client" &&
        structuralValue(tokens[index + 5]) === "(" &&
        tokens[index + 6]?.kind === "string" &&
        tokens[index + 6]?.value === "bedrock-runtime"
      ) {
        const close = matchingIndex(tokens, index + 5, "(", ")");
        const arguments_ = close === null ? [] : tokens.slice(index + 6, close);
        const resolution = resolvedClientPlatform({
          integration: "aws-bedrock",
          canonicalName: "boto3.client",
          defaultPlatform: "aws-bedrock",
          arguments: arguments_,
          language,
        });
        setBinding({
          variable: tokens[index]?.value as string,
          integration: "aws-bedrock",
          ...resolution,
          selectorKind: "polymorphic",
        });
      }
    }
  }
  const parameterNames = functionParameterNames(tokens, language);
  const assignmentCounts = new Map<string, number>();
  for (let index = 0; index < tokens.length - 1; index += 1) {
    const token = tokens[index];
    if (token?.kind === "identifier" && tokens[index + 1]?.value === "=") {
      assignmentCounts.set(token.value, (assignmentCounts.get(token.value) ?? 0) + 1);
    }
  }
  for (const [variable] of bindings) {
    const assignments = assignmentCounts.get(variable) ?? 0;
    if (assignments > 1 || parameterNames.has(variable)) {
      bindings.delete(variable);
    }
  }
  return { bindings, imports };
}

function shadowedJavascriptEnvironmentGlobals(tokens: readonly Token[]): ReadonlySet<string> {
  const candidates = new Set(["process", "Bun", "Deno"]);
  const shadowed = new Set<string>();
  for (const name of functionParameterNames(tokens, "javascript")) {
    if (candidates.has(name)) shadowed.add(name);
  }
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token?.kind !== "identifier" || !candidates.has(token.value)) continue;
    const previous = tokens[index - 1]?.value;
    if (
      ["const", "let", "var", "class", "function", "import"].includes(previous ?? "") ||
      tokens[index + 1]?.value === "="
    ) {
      shadowed.add(token.value);
    }
  }
  return shadowed;
}

function withTrailingEnvironmentFallback(
  tokens: readonly Token[],
  expressionEnd: number,
  language: "javascript" | "python",
  reference: EnvironmentReference,
): EnvironmentReference {
  if (language === "javascript") {
    if (tokens[expressionEnd]?.value === "??") {
      return { ...reference, fallbackIndex: expressionEnd + 1 };
    }
    if (
      tokens[expressionEnd]?.value === "|" &&
      tokens[expressionEnd + 1]?.value === "|"
    ) {
      return { ...reference, fallbackIndex: expressionEnd + 2 };
    }
  } else if (tokens[expressionEnd]?.value === "or") {
    return { ...reference, fallbackIndex: expressionEnd + 1 };
  }
  return reference;
}

function environmentCallReference(
  tokens: readonly Token[],
  openIndex: number,
  allowArgumentFallback: boolean,
): { reference: EnvironmentReference; expressionEnd: number } | undefined {
  if (tokens[openIndex]?.value !== "(") return undefined;
  const close = matchingIndex(tokens, openIndex, "(", ")");
  const name = tokens[openIndex + 1];
  if (
    close === null ||
    name?.kind !== "string" ||
    !name.static ||
    !ENVIRONMENT_NAME.test(name.value)
  ) {
    return undefined;
  }
  if (structuralValue(tokens[openIndex + 2]) === ")") {
    return { reference: { variable: name.value }, expressionEnd: close + 1 };
  }
  if (!allowArgumentFallback || tokens[openIndex + 2]?.value !== ",") return undefined;
  const fallbackIndex = openIndex + 3;
  if (fallbackIndex + 1 !== close) return undefined;
  return {
    reference: { variable: name.value, fallbackIndex },
    expressionEnd: close + 1,
  };
}

function environmentReferenceAt(
  tokens: readonly Token[],
  valueIndex: number,
  language: "javascript" | "python",
  imports: ImportProvenance,
  shadowedJavascriptGlobals: ReadonlySet<string>,
): EnvironmentReference | undefined {
  const root = tokens[valueIndex]?.value;
  if (language === "javascript") {
    if (
      (root === "process" || root === "Bun") &&
      !shadowedJavascriptGlobals.has(root) &&
      tokens[valueIndex + 1]?.value === "." &&
      tokens[valueIndex + 2]?.value === "env"
    ) {
      if (
        tokens[valueIndex + 3]?.value === "." &&
        tokens[valueIndex + 4]?.kind === "identifier" &&
        ENVIRONMENT_NAME.test(tokens[valueIndex + 4]?.value ?? "")
      ) {
        return withTrailingEnvironmentFallback(
          tokens,
          valueIndex + 5,
          language,
          { variable: tokens[valueIndex + 4]?.value as string },
        );
      }
      if (
        structuralValue(tokens[valueIndex + 3]) === "[" &&
        tokens[valueIndex + 4]?.kind === "string" &&
        tokens[valueIndex + 4]?.static &&
        ENVIRONMENT_NAME.test(tokens[valueIndex + 4]?.value ?? "") &&
        structuralValue(tokens[valueIndex + 5]) === "]"
      ) {
        return withTrailingEnvironmentFallback(
          tokens,
          valueIndex + 6,
          language,
          { variable: tokens[valueIndex + 4]?.value as string },
        );
      }
    }
    if (
      root === "Deno" &&
      !shadowedJavascriptGlobals.has(root) &&
      tokens[valueIndex + 1]?.value === "." &&
      tokens[valueIndex + 2]?.value === "env" &&
      tokens[valueIndex + 3]?.value === "." &&
      tokens[valueIndex + 4]?.value === "get"
    ) {
      const call = environmentCallReference(tokens, valueIndex + 5, false);
      return call === undefined
        ? undefined
        : withTrailingEnvironmentFallback(tokens, call.expressionEnd, language, call.reference);
    }
    if (
      root === "import" &&
      tokens[valueIndex + 1]?.value === "." &&
      tokens[valueIndex + 2]?.value === "meta" &&
      tokens[valueIndex + 3]?.value === "." &&
      tokens[valueIndex + 4]?.value === "env" &&
      tokens[valueIndex + 5]?.value === "." &&
      tokens[valueIndex + 6]?.kind === "identifier" &&
      ENVIRONMENT_NAME.test(tokens[valueIndex + 6]?.value ?? "")
    ) {
      return withTrailingEnvironmentFallback(
        tokens,
        valueIndex + 7,
        language,
        { variable: tokens[valueIndex + 6]?.value as string },
      );
    }
    return undefined;
  }

  if (root !== undefined && imports.pythonOsNamespaces.has(root)) {
    if (
      tokens[valueIndex + 1]?.value === "." &&
      tokens[valueIndex + 2]?.value === "getenv"
    ) {
      const call = environmentCallReference(tokens, valueIndex + 3, true);
      return call === undefined
        ? undefined
        : withTrailingEnvironmentFallback(tokens, call.expressionEnd, language, call.reference);
    }
    if (
      tokens[valueIndex + 1]?.value === "." &&
      tokens[valueIndex + 2]?.value === "environ"
    ) {
      if (
        structuralValue(tokens[valueIndex + 3]) === "[" &&
        tokens[valueIndex + 4]?.kind === "string" &&
        tokens[valueIndex + 4]?.static &&
        ENVIRONMENT_NAME.test(tokens[valueIndex + 4]?.value ?? "") &&
        structuralValue(tokens[valueIndex + 5]) === "]"
      ) {
        return withTrailingEnvironmentFallback(
          tokens,
          valueIndex + 6,
          language,
          { variable: tokens[valueIndex + 4]?.value as string },
        );
      }
      if (
        tokens[valueIndex + 3]?.value === "." &&
        tokens[valueIndex + 4]?.value === "get"
      ) {
        const call = environmentCallReference(tokens, valueIndex + 5, true);
        return call === undefined
          ? undefined
          : withTrailingEnvironmentFallback(tokens, call.expressionEnd, language, call.reference);
      }
    }
  }
  if (root !== undefined && imports.pythonGetenvFunctions.has(root)) {
    const call = environmentCallReference(tokens, valueIndex + 1, true);
    return call === undefined
      ? undefined
      : withTrailingEnvironmentFallback(tokens, call.expressionEnd, language, call.reference);
  }
  if (root !== undefined && imports.pythonEnvironObjects.has(root)) {
    if (
      structuralValue(tokens[valueIndex + 1]) === "[" &&
      tokens[valueIndex + 2]?.kind === "string" &&
      tokens[valueIndex + 2]?.static &&
      ENVIRONMENT_NAME.test(tokens[valueIndex + 2]?.value ?? "") &&
      structuralValue(tokens[valueIndex + 3]) === "]"
    ) {
      return withTrailingEnvironmentFallback(
        tokens,
        valueIndex + 4,
        language,
        { variable: tokens[valueIndex + 2]?.value as string },
      );
    }
    if (tokens[valueIndex + 1]?.value === "." && tokens[valueIndex + 2]?.value === "get") {
      const call = environmentCallReference(tokens, valueIndex + 3, true);
      return call === undefined
        ? undefined
        : withTrailingEnvironmentFallback(tokens, call.expressionEnd, language, call.reference);
    }
  }
  return undefined;
}

function requestScopedBinding(
  binding: ClientBinding,
  requestArguments: readonly Token[],
): ClientBinding {
  if (binding.integration !== "google") return binding;
  const endpoint = endpointSignal(requestArguments);
  if (!endpoint.present) return binding;
  if (
    !endpoint.safe ||
    (endpoint.platform !== "google" && endpoint.platform !== "google-vertex")
  ) {
    return {
      variable: binding.variable,
      integration: binding.integration,
      platformResolution: "unknown",
      selectorKind: binding.selectorKind,
      endpointSafe: false,
    };
  }
  if (
    binding.platformResolution === "resolved" &&
    binding.servingPlatform !== endpoint.platform
  ) {
    return {
      variable: binding.variable,
      integration: binding.integration,
      platformResolution: "ambiguous",
      selectorKind: binding.selectorKind,
      endpointSafe: false,
    };
  }
  return {
    variable: binding.variable,
    integration: binding.integration,
    servingPlatform: endpoint.platform,
    platformResolution: "resolved",
    selectorKind: binding.selectorKind,
    endpointSafe: true,
  };
}

function guardIntegrationSelector(
  binding: ClientBinding,
  resolved: ResolvedValue,
): ResolvedValue {
  if (
    binding.integration !== "google" ||
    resolved.modelResolution !== "resolved" ||
    resolved.modelId === undefined ||
    !resolved.modelId.includes("/")
  ) {
    return resolved;
  }
  const { modelId: _modelId, ...unresolved } = resolved;
  return {
    ...unresolved,
    modelResolution: "unresolved",
    selectorKind: "resource-name",
    trace: [
      ...resolved.trace,
      {
        kind: "detector",
        detail: "Google resource, tuned-model, and publisher paths are not exact model IDs",
      },
    ],
  };
}

function methodRule(binding: ClientBinding, chain: readonly string[]): { ruleId: string; property: string } | null {
  const tail = chain.slice(1).join(".");
  if (binding.integration === "openai") {
    const accepted = new Set([
      "responses.create",
      "responses.stream",
      "chat.completions.create",
      "chat.completions.stream",
      "embeddings.create",
      "images.generate",
      "images.edit",
      "audio.speech.create",
      "audio.transcriptions.create",
      "audio.translations.create",
    ]);
    return accepted.has(tail)
      ? {
          ruleId: chain[0] !== undefined && binding.variable === chain[0]
            ? "request-model"
            : "request-model",
          property: "model",
        }
      : null;
  }
  if (binding.integration === "anthropic") {
    return new Set(["messages.create", "messages.stream", "messages.countTokens", "messages.count_tokens"]).has(tail)
      ? { ruleId: "messages-model", property: "model" }
      : null;
  }
  if (binding.integration === "google") {
    return new Set([
      "models.generateContent",
      "models.generateContentStream",
      "models.generate_content",
      "models.generate_content_stream",
    ]).has(tail)
      ? { ruleId: "generate-model", property: "model" }
      : null;
  }
  if (binding.integration === "aws-bedrock") {
    if (new Set(["invoke_model", "invoke_model_with_response_stream"]).has(tail)) {
      return { ruleId: "invoke-model", property: "modelId" };
    }
    if (new Set(["converse", "converse_stream"]).has(tail)) {
      return { ruleId: "converse-model", property: "modelId" };
    }
  }
  return null;
}

function semanticRuleId(language: "javascript" | "python", integration: ClientBinding["integration"], rule: string): string {
  const languageId = language === "javascript" ? "ts" : "py";
  if (integration === "openai") return `source.${languageId}.openai.${rule}@1`;
  if (integration === "anthropic") return `source.${languageId}.anthropic.${rule}@1`;
  if (integration === "google") return `source.${languageId}.google-genai.${rule}@1`;
  return `source.${languageId}.aws-bedrock.${rule}@1`;
}

function makeEvidenceId(
  ruleId: string,
  path: string,
  anchor: string,
  rawValue: string,
  occurrence: number,
): string {
  return canonicalSha256("ai-model-eol/semantic-evidence/v3", [
    ruleId,
    path,
    anchor,
    rawValue,
    occurrence,
  ]);
}

function createSemanticFact(input: {
  ruleId: string;
  path: string;
  blobOid: string;
  scope: EvidenceScope;
  token: Token;
  binding: ClientBinding;
  resolved: ResolvedValue;
  occurrence: number;
  anchor: string;
}): EvidenceFact {
  const environment = input.scope === "test" ? "test" : "unknown";
  const policyEligible =
    DIRECT_POLICY_RULES.has(input.ruleId) &&
    input.binding.endpointSafe &&
    input.binding.platformResolution === "resolved" &&
    input.binding.selectorKind === "model-id" &&
    input.resolved.modelResolution === "resolved" &&
    input.resolved.selectorKind === "model-id" &&
    input.scope !== "test" &&
    input.scope !== "example" &&
    input.scope !== "documentation";
  return {
    evidenceId: makeEvidenceId(
      input.ruleId,
      input.path,
      input.anchor,
      input.resolved.rawValue,
      input.occurrence,
    ),
    origin: "repository",
    kind: "sdk-argument",
    confidence: "high",
    scope: input.scope,
    environment,
    detectorRuleId: input.ruleId,
    detectorManifestVersion: DETECTOR_MANIFEST_VERSION,
    rawValue: input.resolved.rawValue,
    ...(input.resolved.modelId === undefined ? {} : { modelId: input.resolved.modelId }),
    ...(input.binding.servingPlatform === undefined
      ? {}
      : { servingPlatform: input.binding.servingPlatform }),
    modelResolution: input.resolved.modelResolution,
    selectorKind: input.resolved.selectorKind,
    platformResolution: input.binding.platformResolution,
    policyEligible,
    locations: [
      {
        path: input.path,
        line: input.token.line,
        column: input.token.column,
        blobOid: input.blobOid,
      },
    ],
    resolutionTrace: [
      { kind: "detector", detail: input.anchor },
      ...input.resolved.trace,
    ],
  };
}

function directSemanticLiteralSpan(
  token: Token,
  resolved: ResolvedValue,
): SemanticLiteralSpan | undefined {
  if (
    token.kind !== "string" ||
    !token.static ||
    resolved.modelResolution !== "resolved" ||
    resolved.modelId === undefined ||
    token.value !== resolved.modelId
  ) {
    return undefined;
  }
  const quote = token.raw[0];
  if (quote !== "'" && quote !== '"' && quote !== "`") return undefined;
  const quoteLength = token.raw.startsWith(quote.repeat(3)) ? 3 : 1;
  const literalContent = token.raw.slice(quoteLength, -quoteLength);
  // Escaped spellings have a distinct lexical occurrence (or no exact lexical
  // occurrence at all), so only collapse an exact source span.
  if (literalContent !== resolved.modelId) return undefined;
  const startOffset = token.offset + quoteLength;
  return {
    modelId: resolved.modelId,
    startOffset,
    endOffset: startOffset + literalContent.length,
  };
}

type AiSdkProviderBinding = {
  variable: string;
  provider: AiSdkProvider;
  servingPlatform?: string;
  platformResolution: PlatformResolution;
  endpointSafe: boolean;
};

/**
 * The variable a `=` at `equalsIndex` assigns to, or undefined when the target is
 * not a plain variable this pass can follow. A member expression (`this.client =`,
 * `registry.openai =`) would otherwise register the bare property name, so an
 * unrelated call to a function of that name reads as a provider call — and, worse,
 * a property named after another provider re-binds it to the wrong platform. A
 * TypeScript annotation (`const openai: OpenAIProvider = …`) puts the type name
 * immediately before the `=`, so the declared name is recovered by stepping back
 * over it.
 */
function assignedVariableBefore(
  tokens: readonly Token[],
  equalsIndex: number,
): string | undefined {
  let index = equalsIndex - 1;
  // Step back over a simple type annotation — `: OpenAIProvider`, `: Provider<C>`,
  // `: A | B`, `: Foo[]` — to the name it annotates. The run deliberately excludes
  // `,`, `;`, and every bracket that is not part of an index or type-argument
  // list, so the scan cannot walk out of the declaration and mistake an earlier
  // object literal's `a: 1` for the annotation.
  const annotationToken = new Set([".", "<", ">", "|", "&", "[", "]", "?"]);
  for (let scan = index; scan > 0 && index - scan < 12; scan -= 1) {
    const value = structuralValue(tokens[scan]);
    if (value === ":") {
      index = scan - 1;
      break;
    }
    if (tokens[scan]?.kind === "identifier") continue;
    if (value !== null && annotationToken.has(value)) continue;
    break;
  }
  const token = tokens[index];
  if (token === undefined || token.kind !== "identifier" || token.jsx === true) return undefined;
  return isBareAssignmentTarget(tokens, index) ? token.value : undefined;
}

/**
 * An explicit recognized endpoint must agree with the provider package. A
 * custom or computed endpoint leaves the platform unknown, exactly as a custom
 * `baseURL` does for the official OpenAI client.
 */
function aiSdkFactoryPlatform(
  provider: AiSdkProvider,
  arguments_: readonly Token[],
): Pick<AiSdkProviderBinding, "servingPlatform" | "platformResolution" | "endpointSafe"> {
  const endpoint = endpointSignal(arguments_);
  if (!endpoint.safe) return { platformResolution: "unknown", endpointSafe: false };
  if (!endpoint.present || endpoint.platform === provider.platform) {
    return {
      servingPlatform: provider.platform,
      platformResolution: "resolved",
      endpointSafe: true,
    };
  }
  return { platformResolution: "ambiguous", endpointSafe: false };
}

function aiSdkProviderBindings(
  tokens: readonly Token[],
  imports: ImportProvenance,
): Map<string, AiSdkProviderBinding> {
  const bindings = new Map<string, AiSdkProviderBinding>();
  const conflicted = new Set<string>();
  const setBinding = (binding: AiSdkProviderBinding): void => {
    if (conflicted.has(binding.variable)) return;
    const existing = bindings.get(binding.variable);
    if (existing !== undefined && JSON.stringify(existing) !== JSON.stringify(binding)) {
      bindings.delete(binding.variable);
      conflicted.add(binding.variable);
      return;
    }
    bindings.set(binding.variable, binding);
  };
  for (const [variable, provider] of imports.aiSdkInstances) {
    setBinding({
      variable,
      provider,
      servingPlatform: provider.platform,
      platformResolution: "resolved",
      endpointSafe: true,
    });
  }
  for (let index = 0; index < tokens.length; index += 1) {
    if (tokens[index]?.kind !== "identifier") continue;
    const provider = imports.aiSdkFactories.get(tokens[index]?.value ?? "");
    if (provider === undefined || structuralValue(tokens[index + 1]) !== "(") continue;
    if (tokens[index - 1]?.value !== "=") continue;
    const variable = assignedVariableBefore(tokens, index - 1);
    if (variable === undefined) continue;
    const close = matchingIndex(tokens, index + 1, "(", ")");
    const arguments_ = close === null ? [] : tokens.slice(index + 2, close);
    setBinding({
      variable,
      provider,
      ...aiSdkFactoryPlatform(provider, arguments_),
    });
  }
  const parameterNames = functionParameterNames(tokens, "javascript");
  const assignmentCounts = new Map<string, number>();
  for (let index = 0; index < tokens.length - 1; index += 1) {
    const token = tokens[index];
    if (token?.kind === "identifier" && tokens[index + 1]?.value === "=") {
      assignmentCounts.set(token.value, (assignmentCounts.get(token.value) ?? 0) + 1);
    }
  }
  for (const [variable] of bindings) {
    if ((assignmentCounts.get(variable) ?? 0) > 1 || parameterNames.has(variable)) {
      bindings.delete(variable);
    }
  }
  return bindings;
}

/**
 * Whether a token can begin a model selector. A selector is a string, a template,
 * or an expression that reads one — never an object literal, array, spread, or
 * callback. Accepting those would publish a punctuation `rawValue` such as `{` or
 * `.`, which is both meaningless in the report and unusable as the
 * trusted-resolution match key, and would mark the file as read when its real
 * selector shape was never understood.
 */
function opensModelSelector(token: Token): boolean {
  if (token.kind === "string") return true;
  if (token.kind === "identifier") return true;
  return false;
}

/**
 * A provider call is anchored on the provider, not on the surrounding `ai`
 * function: the call itself constructs the model specification, so it is
 * evidence wherever the result is used — passed straight to `generateText`,
 * held in a constant, or wrapped by middleware.
 */
function detectAiSdkModelCalls(input: {
  tokens: readonly Token[];
  constants: ReadonlyMap<string, string>;
  imports: ImportProvenance;
  path: string;
  blobOid: string;
  scope: EvidenceScope;
  shadowedEnvironmentGlobals: ReadonlySet<string>;
}): {
  facts: EvidenceFact[];
  consumed: Array<{ fact: EvidenceFact; binding: ClientBinding; resolved: ResolvedValue }>;
  literalSpans: SemanticLiteralSpan[];
} {
  const { tokens } = input;
  const facts: EvidenceFact[] = [];
  const consumed: Array<{ fact: EvidenceFact; binding: ClientBinding; resolved: ResolvedValue }> = [];
  const literalSpans: SemanticLiteralSpan[] = [];
  // Checked before the binding scan, which walks every token twice: a file that
  // imported no provider can produce no binding, so the passes are pure waste.
  // A factory can also be invoked directly, without ever binding a variable.
  if (input.imports.aiSdkInstances.size === 0 && input.imports.aiSdkFactories.size === 0) {
    return { facts, consumed, literalSpans };
  }
  const bindings = aiSdkProviderBindings(tokens, input.imports);
  const occurrenceByAnchor = new Map<string, number>();
  for (let openIndex = 0; openIndex < tokens.length; openIndex += 1) {
    if (structuralValue(tokens[openIndex]) !== "(") continue;
    const chain = chainBefore(tokens, openIndex);
    let binding: AiSdkProviderBinding | undefined;
    let anchorChain = chain;
    const root = chain[0];
    if (root !== undefined) {
      if (chain.length > 2) continue;
      binding = bindings.get(root);
      const method = chain[1];
      if (binding !== undefined && method !== undefined && !AI_SDK_MODEL_METHODS.has(method)) {
        continue;
      }
    } else if (structuralValue(tokens[openIndex - 1]) === ")") {
      // `createOpenAI({ ... })("model")` calls the factory result directly.
      const factoryOpen = matchingOpenIndex(tokens, openIndex - 1, "(", ")");
      const nameIndex = factoryOpen === null ? -1 : factoryOpen - 1;
      const provider = nameIndex < 0
        ? undefined
        : input.imports.aiSdkFactories.get(tokens[nameIndex]?.value ?? "");
      if (provider === undefined || tokens[nameIndex]?.kind !== "identifier") continue;
      binding = {
        variable: tokens[nameIndex]?.value as string,
        provider,
        ...aiSdkFactoryPlatform(provider, tokens.slice((factoryOpen as number) + 1, openIndex - 1)),
      };
      anchorChain = [tokens[nameIndex]?.value as string, "()"];
    }
    if (binding === undefined) continue;
    const valueIndex = openIndex + 1;
    const valueToken = tokens[valueIndex];
    if (valueToken === undefined || !opensModelSelector(valueToken)) continue;
    const clientBinding: ClientBinding = {
      variable: binding.variable,
      integration: binding.provider.integration,
      ...(binding.servingPlatform === undefined
        ? {}
        : { servingPlatform: binding.servingPlatform }),
      platformResolution: binding.platformResolution,
      selectorKind: binding.provider.selectorKind,
      endpointSafe: binding.endpointSafe,
    };
    const environmentReference = environmentReferenceAt(
      tokens,
      valueIndex,
      "javascript",
      input.imports,
      input.shadowedEnvironmentGlobals,
    );
    const resolved = guardIntegrationSelector(
      clientBinding,
      resolveTokenValue(
        tokens,
        valueIndex,
        input.constants,
        binding.provider.selectorKind,
        environmentReference,
      ),
    );
    const ruleId = aiSdkRuleId(binding.provider);
    const anchor = anchorChain.join(".");
    const occurrence = occurrenceByAnchor.get(anchor) ?? 0;
    occurrenceByAnchor.set(anchor, occurrence + 1);
    const fact = createSemanticFact({
      ruleId,
      path: input.path,
      blobOid: input.blobOid,
      scope: input.scope,
      token: valueToken,
      binding: clientBinding,
      resolved,
      occurrence,
      anchor,
    });
    facts.push(fact);
    const literalSpan = directSemanticLiteralSpan(valueToken, resolved);
    if (literalSpan !== undefined) literalSpans.push(literalSpan);
    consumed.push({ fact, binding: clientBinding, resolved });
    assertEvidenceBudget(facts.length);
  }
  return { facts, consumed, literalSpans };
}

function detectSdkCalls(
  source: string,
  path: string,
  blobOid: string,
  language: "javascript" | "python",
  scope: EvidenceScope,
  jsx = false,
): {
  facts: EvidenceFact[];
  consumedEnvironmentSelectors: ConsumedEnvironmentSelector[];
  literalSpans: SemanticLiteralSpan[];
  unsupportedFrameworkImports: Array<{ frameworkId: string; facade: boolean }>;
  tokenizationIssue?: TokenizationIssue;
} {
  const tokenization = tokenize(source, language, jsx);
  if (tokenization.issue !== undefined) {
    // The import parse cannot be trusted after a tokenization failure, and that
    // file already reports incomplete semantic coverage on its own.
    return {
      facts: [],
      consumedEnvironmentSelectors: [],
      literalSpans: [],
      unsupportedFrameworkImports: [],
      tokenizationIssue: tokenization.issue,
    };
  }
  const tokens = tokenization.tokens;
  const constants = collectConstants(tokens, language);
  const analyzedClients = clientBindings(tokens, language);
  const bindings = analyzedClients.bindings;
  const facts: EvidenceFact[] = [];
  const consumedEnvironmentSelectors: ConsumedEnvironmentSelector[] = [];
  const literalSpans: SemanticLiteralSpan[] = [];
  const shadowedEnvironmentGlobals = language === "javascript"
    ? shadowedJavascriptEnvironmentGlobals(tokens)
    : new Set<string>();
  const recordConsumedEnvironment = (
    fact: EvidenceFact,
    binding: ClientBinding,
    resolved: ResolvedValue,
  ): void => {
    if (resolved.environmentVariable === undefined) return;
    const location = fact.locations[0];
    if (location === undefined) return;
    consumedEnvironmentSelectors.push({
      variable: resolved.environmentVariable,
      ruleId: fact.detectorRuleId,
      scope: fact.scope,
      environment: fact.environment,
      binding,
      location,
    });
  };
  const occurrenceByAnchor = new Map<string, number>();
  for (let openIndex = 0; openIndex < tokens.length; openIndex += 1) {
    if (structuralValue(tokens[openIndex]) !== "(") continue;
    const chain = chainBefore(tokens, openIndex);
    const binding = chain[0] === undefined ? undefined : bindings.get(chain[0]);
    if (binding === undefined) continue;
    const rule = methodRule(binding, chain);
    if (rule === null) continue;
    const closeIndex = matchingIndex(tokens, openIndex, "(", ")");
    if (closeIndex === null) continue;
    const separator = language === "javascript" ? ":" : "=";
    const valueIndex = directArgumentPropertyValueIndex(
      tokens,
      openIndex + 1,
      closeIndex,
      rule.property,
      separator,
      language,
    );
    if (valueIndex === null) continue;
    const valueToken = tokens[valueIndex];
    if (valueToken === undefined) continue;
    const effectiveBinding = requestScopedBinding(
      binding,
      tokens.slice(openIndex + 1, closeIndex),
    );
    const environmentReference = environmentReferenceAt(
      tokens,
      valueIndex,
      language,
      analyzedClients.imports,
      shadowedEnvironmentGlobals,
    );
    const resolved = guardIntegrationSelector(
      effectiveBinding,
      resolveTokenValue(
        tokens,
        valueIndex,
        constants,
        effectiveBinding.selectorKind,
        environmentReference,
      ),
    );
    const ruleId = semanticRuleId(language, binding.integration, rule.ruleId);
    const anchor = chain.join(".");
    const occurrence = occurrenceByAnchor.get(anchor) ?? 0;
    occurrenceByAnchor.set(anchor, occurrence + 1);
    const fact = createSemanticFact({
      ruleId,
      path,
      blobOid,
      scope,
      token: valueToken,
      binding: effectiveBinding,
      resolved,
      occurrence,
      anchor,
    });
    facts.push(fact);
    const literalSpan = directSemanticLiteralSpan(valueToken, resolved);
    if (literalSpan !== undefined) literalSpans.push(literalSpan);
    recordConsumedEnvironment(fact, effectiveBinding, resolved);
    assertEvidenceBudget(facts.length);
  }

  if (language === "javascript" && analyzedClients.imports.awsCommands.size > 0) {
    const commands: Readonly<Record<string, { rule: string; property: string }>> = {
      InvokeModelCommand: { rule: "invoke-model", property: "modelId" },
      InvokeModelWithResponseStreamCommand: { rule: "invoke-model", property: "modelId" },
      ConverseCommand: { rule: "converse-model", property: "modelId" },
      ConverseStreamCommand: { rule: "converse-model", property: "modelId" },
    };
    for (let index = 0; index < tokens.length - 3; index += 1) {
      if (!isIdentifier(tokens[index], "new")) continue;
      const canonicalCommand = analyzedClients.imports.awsCommands.get(
        tokens[index + 1]?.value ?? "",
      );
      const command = canonicalCommand === undefined ? undefined : commands[canonicalCommand];
      if (command === undefined || tokens[index + 2]?.value !== "(") continue;
      const close = matchingIndex(tokens, index + 2, "(", ")");
      if (close === null) continue;
      const valueIndex = directArgumentPropertyValueIndex(
        tokens,
        index + 3,
        close,
        command.property,
        ":",
        language,
      );
      if (valueIndex === null || tokens[valueIndex] === undefined) continue;
      const awsClients = [...bindings.values()].filter(
        (binding) => binding.integration === "aws-bedrock",
      );
      const clientSignatures = new Set(
        awsClients.map((binding) =>
          JSON.stringify([
            binding.servingPlatform ?? null,
            binding.platformResolution,
            binding.endpointSafe,
          ])
        ),
      );
      const sourceBinding =
        awsClients.length > 0 && clientSignatures.size === 1
          ? awsClients[0]
          : undefined;
      const binding: ClientBinding = sourceBinding === undefined
        ? {
            variable: tokens[index + 1]?.value as string,
            integration: "aws-bedrock",
            platformResolution: awsClients.length > 1 ? "ambiguous" : "unknown",
            selectorKind: "polymorphic",
            endpointSafe: false,
          }
        : {
            ...sourceBinding,
            variable: tokens[index + 1]?.value as string,
            selectorKind: "polymorphic",
          };
      const ruleId = semanticRuleId(language, "aws-bedrock", command.rule);
      const environmentReference = environmentReferenceAt(
        tokens,
        valueIndex,
        language,
        analyzedClients.imports,
        shadowedEnvironmentGlobals,
      );
      const resolved = resolveTokenValue(
        tokens,
        valueIndex,
        constants,
        "polymorphic",
        environmentReference,
      );
      const fact = createSemanticFact({
        ruleId,
        path,
        blobOid,
        scope,
        token: tokens[valueIndex] as Token,
        binding,
        resolved,
        occurrence: facts.length,
        anchor: canonicalCommand as string,
      });
      facts.push(fact);
      const literalSpan = directSemanticLiteralSpan(tokens[valueIndex] as Token, resolved);
      if (literalSpan !== undefined) literalSpans.push(literalSpan);
      recordConsumedEnvironment(fact, binding, resolved);
      assertEvidenceBudget(facts.length);
    }
  }
  if (language === "javascript") {
    const aiSdk = detectAiSdkModelCalls({
      tokens,
      constants,
      imports: analyzedClients.imports,
      path,
      blobOid,
      scope,
      shadowedEnvironmentGlobals,
    });
    facts.push(...aiSdk.facts);
    literalSpans.push(...aiSdk.literalSpans);
    for (const entry of aiSdk.consumed) {
      recordConsumedEnvironment(entry.fact, entry.binding, entry.resolved);
    }
    assertEvidenceBudget(facts.length);
  }
  return {
    facts,
    consumedEnvironmentSelectors,
    literalSpans,
    unsupportedFrameworkImports: unsupportedFrameworkImports(
      analyzedClients.imports.moduleSpecifiers,
      facts,
      language,
    ),
  };
}

type TerraformStringAttribute =
  | { state: "absent" }
  | { state: "non-static" }
  | { state: "static"; token: Token; value: string };

function terraformStringAttribute(
  tokens: readonly Token[],
  valueIndex: number | null,
  blockClose: number,
): TerraformStringAttribute {
  if (valueIndex === null) return { state: "absent" };
  const token = tokens[valueIndex];
  if (token?.kind !== "string" || token.raw[0] !== '"' || !token.static) {
    return { state: "non-static" };
  }
  const nextIndex = valueIndex + 1;
  const next = tokens[nextIndex];
  const followedByAttribute =
    next !== undefined &&
    next.line > token.line &&
    next.kind === "identifier" &&
    structuralValue(tokens[nextIndex + 1]) === "=";
  if (nextIndex !== blockClose && !followedByAttribute) {
    return { state: "non-static" };
  }
  return { state: "static", token, value: token.value };
}

function detectTerraform(
  source: string,
  path: string,
  blobOid: string,
  scope: EvidenceScope,
): { facts: EvidenceFact[]; tokenizationIssue?: TokenizationIssue } {
  const tokenization = tokenize(source, "hcl");
  if (tokenization.issue !== undefined) {
    return { facts: [], tokenizationIssue: tokenization.issue };
  }
  const tokens = tokenization.tokens;
  const facts: EvidenceFact[] = [];
  for (let index = 0; index < tokens.length - 3; index += 1) {
    if (
      !isIdentifier(tokens[index], "resource") ||
      tokens[index + 1]?.kind !== "string" ||
      tokens[index + 1]?.value !== "azurerm_cognitive_deployment"
    ) {
      continue;
    }
    const blockOpen = tokens.findIndex(
      (token, tokenIndex) => tokenIndex > index + 1 && structuralValue(token) === "{",
    );
    if (blockOpen < 0) continue;
    const blockClose = matchingIndex(tokens, blockOpen, "{", "}");
    if (blockClose === null) continue;
    let modelOpen = -1;
    for (let cursor = blockOpen + 1; cursor < blockClose - 1; cursor += 1) {
      if (
        isIdentifier(tokens[cursor], "model") &&
        structuralValue(tokens[cursor + 1]) === "{"
      ) {
        modelOpen = cursor + 1;
        break;
      }
    }
    if (modelOpen < 0) continue;
    const modelClose = matchingIndex(tokens, modelOpen, "{", "}");
    if (modelClose === null) continue;
    const nameIndex = propertyValueIndex(tokens, modelOpen + 1, modelClose, "name", "=");
    const formatIndex = propertyValueIndex(tokens, modelOpen + 1, modelClose, "format", "=");
    const versionIndex = propertyValueIndex(tokens, modelOpen + 1, modelClose, "version", "=");
    const name = terraformStringAttribute(tokens, nameIndex, modelClose);
    const format = terraformStringAttribute(tokens, formatIndex, modelClose);
    const version = terraformStringAttribute(tokens, versionIndex, modelClose);
    if (
      name.state !== "static" ||
      format.state !== "static" ||
      version.state === "non-static"
    ) {
      continue;
    }
    const rawValue = JSON.stringify([
      format.value,
      name.value,
      version.state === "static" ? version.value : null,
    ]);
    const ruleId = "deploy.hcl.azure.cognitive-deployment-model@1";
    facts.push({
      evidenceId: makeEvidenceId(ruleId, path, "azurerm_cognitive_deployment.model", rawValue, facts.length),
      origin: "repository",
      kind: "deployment-resource",
      confidence: "high",
      scope,
      environment: "unknown",
      detectorRuleId: ruleId,
      detectorManifestVersion: DETECTOR_MANIFEST_VERSION,
      rawValue,
      servingPlatform: "azure",
      modelResolution: "unresolved",
      selectorKind: "deployment-name",
      platformResolution: "resolved",
      policyEligible: false,
      locations: [{ path, line: name.token.line, column: name.token.column, blobOid }],
      resolutionTrace: [
        {
          kind: "detector",
          detail: "static Azure cognitive deployment model tuple; trusted resolution required",
        },
      ],
    });
    assertEvidenceBudget(facts.length);
  }
  return { facts };
}

function pathSegments(path: string): string[] {
  return path.toLowerCase().split("/");
}

export function classifyEvidenceScope(path: string, semantic = false): EvidenceScope {
  const lower = path.toLowerCase();
  const segments = pathSegments(path);
  const extension = extname(lower);
  if (
    extension === ".md" ||
    extension === ".mdx" ||
    segments.some((segment) => ["docs", "doc", "documentation"].includes(segment))
  ) {
    return "documentation";
  }
  const fileName = segments.at(-1) ?? "";
  if (
    segments.some((segment) => ["test", "tests", "__tests__", "spec", "fixtures"].includes(segment)) ||
    /\.(?:test|spec)\.[^.]+$/u.test(fileName)
  ) {
    return "test";
  }
  if (segments.some((segment) => ["example", "examples", "demo", "demos", "sample", "samples"].includes(segment))) {
    return "example";
  }
  if (segments.some((segment) => ["dist", "build", "generated", "out", "archive", "archived", "legacy", "vendor"].includes(segment))) {
    return "unknown";
  }
  if (HCL_EXTENSIONS.has(extension)) return "deployment";
  if (semantic || SOURCE_EXTENSIONS.has(extension)) return "application";
  return "unknown";
}

type AutomatonNode = { transitions: Map<string, number>; failure: number; outputs: number[] };

function lexicalCandidates(index: V3FeedIndex): Array<{
  modelId: string;
  codePointLength: number;
  pairs: IndexedModelPair[];
}> {
  const byId = new Map<string, IndexedModelPair[]>();
  for (const pair of index.lexicalModelPairs) {
    const pairs = byId.get(pair.modelId) ?? [];
    pairs.push(pair);
    byId.set(pair.modelId, pairs);
  }
  return [...byId.entries()]
    .map(([modelId, pairs]) => ({
      modelId,
      codePointLength: [...modelId].length,
      pairs: pairs.sort((left, right) => compareText(left.servingPlatform, right.servingPlatform)),
    }))
    .sort((left, right) => compareText(left.modelId, right.modelId));
}

function buildAutomaton(candidates: readonly { modelId: string }[]): AutomatonNode[] {
  const nodes: AutomatonNode[] = [{ transitions: new Map(), failure: 0, outputs: [] }];
  for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex += 1) {
    let state = 0;
    for (const character of candidates[candidateIndex]?.modelId ?? "") {
      let next = nodes[state]?.transitions.get(character);
      if (next === undefined) {
        next = nodes.length;
        nodes.push({ transitions: new Map(), failure: 0, outputs: [] });
        nodes[state]?.transitions.set(character, next);
      }
      state = next;
    }
    nodes[state]?.outputs.push(candidateIndex);
  }
  const queue: number[] = [];
  for (const state of nodes[0]?.transitions.values() ?? []) queue.push(state);
  for (let queueIndex = 0; queueIndex < queue.length; queueIndex += 1) {
    const state = queue[queueIndex] as number;
    for (const [character, next] of nodes[state]?.transitions ?? []) {
      queue.push(next);
      let fallback = nodes[state]?.failure ?? 0;
      while (fallback !== 0 && !nodes[fallback]?.transitions.has(character)) {
        fallback = nodes[fallback]?.failure ?? 0;
      }
      const transition = nodes[fallback]?.transitions.get(character);
      nodes[next]!.failure = transition === undefined || transition === next ? 0 : transition;
      nodes[next]!.outputs.push(...(nodes[nodes[next]!.failure]?.outputs ?? []));
    }
  }
  return nodes;
}

function identifierCharacter(value: string | undefined): boolean {
  return value !== undefined && IDENTIFIER_CHARACTER.test(value);
}

function characterAt(source: string, index: number): string | undefined {
  if (index < 0 || index >= source.length) return undefined;
  const codePoint = source.codePointAt(index);
  return codePoint === undefined ? undefined : String.fromCodePoint(codePoint);
}

function characterBefore(source: string, index: number): string | undefined {
  if (index <= 0) return undefined;
  let start = index - 1;
  const unit = source.charCodeAt(start);
  if (unit >= 0xdc00 && unit <= 0xdfff && start > 0) start -= 1;
  return characterAt(source, start);
}

function lexicalFacts(
  source: string,
  path: string,
  blobOid: string,
  candidates: readonly {
    modelId: string;
    codePointLength: number;
    pairs: IndexedModelPair[];
  }[],
  automaton: readonly AutomatonNode[],
  semanticLiteralSpans: readonly SemanticLiteralSpan[] = [],
): EvidenceFact[] {
  const scope = classifyEvidenceScope(path);
  const facts: EvidenceFact[] = [];
  let state = 0;
  let offset = 0;
  let line = 1;
  let column = 1;
  const semanticSpans = new Set(
    semanticLiteralSpans.map((span) =>
      JSON.stringify([span.modelId, span.startOffset, span.endOffset])
    ),
  );
  for (const character of source) {
    while (state !== 0 && !automaton[state]?.transitions.has(character)) {
      state = automaton[state]?.failure ?? 0;
    }
    state = automaton[state]?.transitions.get(character) ?? 0;
    for (const candidateIndex of automaton[state]?.outputs ?? []) {
      const candidate = candidates[candidateIndex];
      if (candidate === undefined) continue;
      const end = offset + character.length;
      const start = end - candidate.modelId.length;
      if (
        identifierCharacter(characterBefore(source, start)) ||
        identifierCharacter(characterAt(source, end))
      ) {
        continue;
      }
      if (semanticSpans.has(JSON.stringify([candidate.modelId, start, end]))) continue;
      const platforms = [...new Set(candidate.pairs.map((pair) => pair.servingPlatform))];
      const platformResolution: PlatformResolution = platforms.length === 1 ? "resolved" : "ambiguous";
      const rawValue = candidate.modelId;
      facts.push({
        evidenceId: makeEvidenceId(
          "fallback.text.lifecycle-id@1",
          path,
          candidate.modelId,
          rawValue,
          facts.length,
        ),
        origin: "repository",
        kind: "lexical",
        confidence: "low",
        scope,
        environment: scope === "test" ? "test" : "unknown",
        detectorRuleId: "fallback.text.lifecycle-id@1",
        detectorManifestVersion: DETECTOR_MANIFEST_VERSION,
        rawValue,
        modelId: candidate.modelId,
        ...(platforms.length === 1 ? { servingPlatform: platforms[0] } : {}),
        modelResolution: "resolved",
        selectorKind: "model-id",
        platformResolution,
        policyEligible: false,
        locations: [
          {
            path,
            line,
            column: Math.max(1, column - candidate.codePointLength + 1),
            blobOid,
          },
        ],
        resolutionTrace: [{ kind: "detector", detail: "exact typed-feed lexical fallback" }],
      });
      assertEvidenceBudget(facts.length);
    }
    offset += character.length;
    if (character === "\n") {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
  }
  return facts;
}

function parseDotenvLiteral(
  tail: string,
): { value: string; contentOffset: number } | undefined {
  if (tail === "") return { value: "", contentOffset: 0 };
  const quote = tail[0];
  if (quote === "'" || quote === '"') {
    const close = tail.lastIndexOf(quote);
    if (close <= 0) return undefined;
    const remainder = tail.slice(close + 1);
    if (!/^\s*(?:#.*)?$/u.test(remainder)) return undefined;
    const value = tail.slice(1, close);
    if (quote === '"' && value.includes("\\")) return undefined;
    return { value, contentOffset: 1 };
  }
  const match = /^([^\s#]+)(?:\s+(?:#.*)?)?$/u.exec(tail);
  return match?.[1] === undefined
    ? undefined
    : { value: match[1], contentOffset: 0 };
}

function parseDotenvAssignments(
  source: string,
  path: string,
  blobOid: string,
  consumedNames: ReadonlySet<string>,
  activeModelIds: ReadonlySet<string>,
): EnvironmentAssignment[] {
  const assignments: EnvironmentAssignment[] = [];
  const lines = source.split(/\r?\n/u);
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex] as string;
    const match = /^(\s*(?:export\s+)?)([A-Za-z_][A-Za-z0-9_]{0,127})(\s*=\s*)(.*)$/u.exec(line);
    if (match === null) continue;
    const variable = match[2] as string;
    if (!consumedNames.has(variable)) continue;
    const tail = match[4] as string;
    const literal = parseDotenvLiteral(tail);
    if (literal === undefined || !activeModelIds.has(literal.value)) continue;
    const valueOffset = (match[1]?.length ?? 0) + variable.length +
      (match[3]?.length ?? 0) + literal.contentOffset;
    assignments.push({
      ruleId: "binding.env.consumed-model@1",
      variable,
      value: literal.value,
      path,
      blobOid,
      line: lineIndex + 1,
      column: [...line.slice(0, valueOffset)].length + 1,
    });
  }
  return assignments;
}

function yamlMapValue(map: unknown, key: string): unknown {
  if (!isMap(map)) return undefined;
  for (const pair of map.items) {
    if (isScalar(pair.key) && pair.key.value === key) return pair.value;
  }
  return undefined;
}

function parseGithubWorkflowAssignments(
  source: string,
  path: string,
  blobOid: string,
  consumedNames: ReadonlySet<string>,
  activeModelIds: ReadonlySet<string>,
): { assignments: EnvironmentAssignment[]; invalid: boolean } {
  const lineCounter = new LineCounter();
  const document = parseDocument(source, {
    schema: "core",
    uniqueKeys: true,
    prettyErrors: false,
    strict: true,
    lineCounter,
  });
  if (document.errors.length > 0 || document.warnings.length > 0) {
    return { assignments: [], invalid: true };
  }
  if (document.contents === null) {
    // An empty or comment-only workflow parses cleanly and simply declares no
    // environment assignments; it is not malformed coverage.
    return { assignments: [], invalid: false };
  }
  if (!isMap(document.contents)) {
    return { assignments: [], invalid: true };
  }
  const assignments: EnvironmentAssignment[] = [];
  const inspectEnvMap = (node: unknown): void => {
    if (!isMap(node)) return;
    for (const pair of node.items) {
      if (
        !isScalar(pair.key) ||
        typeof pair.key.value !== "string" ||
        !consumedNames.has(pair.key.value) ||
        !isScalar(pair.value) ||
        typeof pair.value.value !== "string" ||
        !activeModelIds.has(pair.value.value)
      ) {
        continue;
      }
      const start = pair.value.range?.[0];
      if (start === undefined) continue;
      const end = pair.value.range?.[1] ?? start;
      const raw = source.slice(start, end);
      const contentIndex = raw.indexOf(pair.value.value);
      const position = lineCounter.linePos(start + Math.max(0, contentIndex));
      assignments.push({
        ruleId: "binding.github-actions.consumed-model@1",
        variable: pair.key.value,
        value: pair.value.value,
        path,
        blobOid,
        line: position.line,
        column: position.col,
      });
    }
  };

  inspectEnvMap(yamlMapValue(document.contents, "env"));
  const jobs = yamlMapValue(document.contents, "jobs");
  if (isMap(jobs)) {
    for (const jobPair of jobs.items) {
      const job = jobPair.value;
      if (!isMap(job)) continue;
      inspectEnvMap(yamlMapValue(job, "env"));
      const steps = yamlMapValue(job, "steps");
      if (!isSeq(steps)) continue;
      for (const step of steps.items) {
        if (isMap(step)) inspectEnvMap(yamlMapValue(step, "env"));
      }
    }
  }
  return { assignments, invalid: false };
}

function compatiblePlatforms(binding: ClientBinding): ReadonlySet<string> {
  if (binding.platformResolution === "resolved" && binding.servingPlatform !== undefined) {
    return new Set([binding.servingPlatform]);
  }
  if (binding.integration === "openai") return new Set(["openai", "azure"]);
  if (binding.integration === "anthropic") return new Set(["anthropic"]);
  if (binding.integration === "google") return new Set(["google", "google-vertex"]);
  return new Set(["aws-bedrock"]);
}

function protectedAssignmentScope(path: string): EvidenceScope | undefined {
  const scope = classifyEvidenceScope(path);
  if (scope === "documentation" || scope === "test" || scope === "example") return scope;
  const fileName = path.toLowerCase().split("/").at(-1) ?? "";
  if (/^\.env(?:\.[a-z0-9_-]+)*\.(?:example|sample|template|dist)(?:\.|$)/u.test(fileName)) {
    return "example";
  }
  if (/^\.env(?:\.[a-z0-9_-]+)*\.test(?:\.|$)/u.test(fileName)) return "test";
  return undefined;
}

function environmentBindingFacts(
  assignments: readonly EnvironmentAssignment[],
  consumers: readonly ConsumedEnvironmentSelector[],
  feed: V3FeedIndex,
): EvidenceFact[] {
  const activePairsByModel = new Map<string, IndexedModelPair[]>();
  for (const pair of feed.modelPairs) {
    if (pair.activeLifecycles.length === 0) continue;
    const pairs = activePairsByModel.get(pair.modelId) ?? [];
    pairs.push(pair);
    activePairsByModel.set(pair.modelId, pairs);
  }
  for (const pairs of activePairsByModel.values()) {
    pairs.sort((left, right) => compareText(left.servingPlatform, right.servingPlatform));
  }
  const consumersByVariable = new Map<string, ConsumedEnvironmentSelector[]>();
  for (const consumer of consumers) {
    const entries = consumersByVariable.get(consumer.variable) ?? [];
    entries.push(consumer);
    consumersByVariable.set(consumer.variable, entries);
  }
  for (const entries of consumersByVariable.values()) {
    entries.sort((left, right) =>
      compareText(left.location.path, right.location.path) ||
      left.location.line - right.location.line ||
      left.location.column - right.location.column ||
      compareText(left.ruleId, right.ruleId)
    );
  }

  const orderedAssignments = [...assignments].sort((left, right) =>
    compareText(left.path, right.path) ||
    left.line - right.line ||
    left.column - right.column ||
    compareText(left.variable, right.variable) ||
    compareText(left.value, right.value)
  );
  const facts: EvidenceFact[] = [];
  const evidenceIds = new Set<string>();
  for (const assignment of orderedAssignments) {
    const allPairs = activePairsByModel.get(assignment.value) ?? [];
    const matchingConsumers = consumersByVariable.get(assignment.variable) ?? [];
    for (const consumer of matchingConsumers) {
      const platforms = compatiblePlatforms(consumer.binding);
      const compatiblePairs = allPairs.filter((pair) => platforms.has(pair.servingPlatform));
      if (compatiblePairs.length === 0) continue;
      const crossPlatformConflict = allPairs.some((pair) => !platforms.has(pair.servingPlatform));
      const platformResolution: PlatformResolution =
        consumer.binding.platformResolution === "resolved"
          ? "resolved"
          : consumer.binding.platformResolution === "ambiguous" && !crossPlatformConflict
            ? "ambiguous"
            : "unknown";
      const servingPlatform = platformResolution === "resolved"
        ? consumer.binding.servingPlatform
        : undefined;
      const googleResource = consumer.binding.integration === "google" &&
        assignment.value.includes("/");
      const scope = protectedAssignmentScope(assignment.path) ?? consumer.scope;
      const environment = scope === "test" ? "test" : consumer.environment;
      const anchor = JSON.stringify([
        assignment.variable,
        consumer.ruleId,
        consumer.location.path,
        consumer.location.line,
        consumer.location.column,
        platformResolution,
        servingPlatform ?? null,
        scope,
      ]);
      const evidenceId = makeEvidenceId(
        assignment.ruleId,
        assignment.path,
        anchor,
        assignment.value,
        0,
      );
      if (evidenceIds.has(evidenceId)) continue;
      evidenceIds.add(evidenceId);
      facts.push({
        evidenceId,
        origin: "repository",
        kind: "env-binding",
        confidence: "high",
        scope,
        environment,
        detectorRuleId: assignment.ruleId,
        detectorManifestVersion: DETECTOR_MANIFEST_VERSION,
        rawValue: assignment.value,
        ...(googleResource ? {} : { modelId: assignment.value }),
        ...(servingPlatform === undefined ? {} : { servingPlatform }),
        modelResolution: googleResource ? "unresolved" : "resolved",
        selectorKind: googleResource ? "resource-name" : consumer.binding.selectorKind,
        platformResolution,
        policyEligible: false,
        locations: [
          {
            path: assignment.path,
            line: assignment.line,
            column: assignment.column,
            blobOid: assignment.blobOid,
          },
          consumer.location,
        ],
        resolutionTrace: [
          {
            kind: "detector",
            detail: `exact committed model value for environment variable ${assignment.variable}`,
          },
          {
            kind: "environment-fallback",
            detail: `consumed by ${consumer.ruleId} at ${consumer.location.path}:${consumer.location.line}`,
          },
        ],
      });
      assertEvidenceBudget(facts.length);
    }
  }
  return facts;
}

function supportedSemanticPath(path: string): boolean {
  const extension = extname(path.toLowerCase());
  return JS_EXTENSIONS.has(extension) ||
    extension === ".py" ||
    HCL_EXTENSIONS.has(extension) ||
    DOTENV_PATH.test(path) ||
    GITHUB_WORKFLOW_PATH.test(path);
}

/**
 * A tokenization failure is degraded fidelity, not a coverage blind spot: the
 * blob is still assessed by the lexical fallback, whose evidence is already
 * capped at advisory authority. Declared coverage therefore stays complete, so a
 * construct no published tokenizer accepts — JSX, most visibly — cannot pin a
 * repository to `scan-status: partial` and force `allowPartial: true`, which
 * would also switch off fail-closed enforcement for genuinely unassessed blobs.
 */
function tokenizationFidelityDiagnostic(
  path: string,
  language: "javascript" | "python" | "hcl",
  issue: TokenizationIssue,
): CoverageDiagnostic {
  const descriptions: Readonly<Record<TokenizationIssue["kind"], string>> = {
    "invalid-unicode-escape": "an invalid Unicode escape",
    "mismatched-delimiter": "an unmatched or mismatched delimiter",
    "unterminated-block-comment": "an unterminated block comment",
    "unterminated-regex-literal": "an unterminated regular-expression literal",
    "unterminated-string-literal": "an unterminated string literal",
  };
  return {
    code: "semantic-tokenization-incomplete@1",
    message:
      `The ${language} semantic detector found ${descriptions[issue.kind]} at line ${issue.line}, column ${issue.column}. Semantic evidence from this file was discarded; the blob remains assessed by lexical fallback, so declared coverage is unchanged.`,
    path,
    severity: "notice",
  };
}

type UnsupportedFrameworkImportRecord = {
  /** Paths whose import of this framework no published rule read. */
  paths: Set<string>;
  /**
   * Paths whose only unread specifier was the framework's own entrypoint, which
   * selects no model by itself. They are dropped once any file in the snapshot
   * resolved one of the framework's rules, because the provider call the
   * entrypoint consumes commonly lives in a different file.
   */
  facadeOnlyPaths: Set<string>;
};

function recordUnsupportedFrameworks(
  byFramework: Map<string, UnsupportedFrameworkImportRecord>,
  imports: readonly { frameworkId: string; facade: boolean }[],
  path: string,
): void {
  for (const { frameworkId, facade } of imports) {
    const record = byFramework.get(frameworkId) ??
      { paths: new Set<string>(), facadeOnlyPaths: new Set<string>() };
    record.paths.add(path);
    if (facade) record.facadeOnlyPaths.add(path);
    byFramework.set(frameworkId, record);
  }
}

const MAX_DIAGNOSTIC_SAMPLE_PATHS = 5;

/** Fixed prose in an unsupported-framework message, measured for the sample budget. */
const UNSUPPORTED_FRAMEWORK_MESSAGE_BUDGET = 700;

/**
 * One notice per framework rather than one per file: this reports a property of
 * the repository's integration choice, not a defect in each file. Notices keep
 * declared coverage `complete`, so enforcement still cannot fail closed on it.
 *
 * The code carries the framework id because `aggregateDiagnostics` groups by
 * code and severity. A shared code would collapse every framework into one
 * entry, hiding all but the first behind a file count that is really a framework
 * count. The registry bounds this at one code per known framework, so it cannot
 * become the unbounded list that aggregation exists to prevent.
 */
function unsupportedFrameworkDiagnostics(
  byFramework: ReadonlyMap<string, UnsupportedFrameworkImportRecord>,
  facts: readonly EvidenceFact[],
): CoverageDiagnostic[] {
  const diagnostics: CoverageDiagnostic[] = [];
  for (const framework of UNSUPPORTED_INTEGRATION_FRAMEWORKS) {
    const record = byFramework.get(framework.frameworkId);
    if (record === undefined) continue;
    const prefix = framework.rulePrefix;
    const readAnywhere = prefix !== undefined &&
      facts.some((fact) => fact.detectorRuleId.startsWith(prefix));
    const paths = readAnywhere
      ? [...record.paths].filter((path) => !record.facadeOnlyPaths.has(path))
      : [...record.paths];
    if (paths.length === 0) continue;
    const sorted = paths.sort(compareText);
    const cause = framework.semanticSupport === "partial"
      ? "but no published rule for it resolved a model in those files, so the selector shape is one this " +
        "manifest does not read yet (for example a gateway model string such as \"openai/gpt-5\", or a " +
        "provider member outside the published set)"
      : "and this detector manifest publishes no semantic rule for it";
    const preamble =
      `${framework.displayName} (${framework.frameworkId}) is imported by ${sorted.length} tracked file(s), ` +
      `${cause}. Model selections made that way were assessed by bounded lexical fallback only, so they ` +
      "cannot block, are reported only as text matches, and produce nothing at all when the " +
      "selector is dynamic or the model ID is not literal-scan eligible. Files: ";
    // The sample is the only actionable part, so it is trimmed to what survives
    // the publisher's message cap rather than being cut mid-path by it.
    const sample: string[] = [];
    let budget = UNSUPPORTED_FRAMEWORK_MESSAGE_BUDGET - preamble.length;
    for (const path of sorted.slice(0, MAX_DIAGNOSTIC_SAMPLE_PATHS)) {
      const cost = path.length + (sample.length === 0 ? 0 : 2);
      if (sample.length > 0 && cost > budget) break;
      budget -= cost;
      sample.push(path);
    }
    const remaining = sorted.length - sample.length;
    diagnostics.push({
      code: `unsupported-integration-import.${framework.frameworkId}@1`,
      message: `${preamble}${sample.join(", ")}${remaining > 0 ? ` (+${remaining} more)` : ""}.`,
      severity: "notice",
    });
  }
  return diagnostics;
}

/** Paths listed inside an aggregated diagnostic message. */
const AGGREGATED_DIAGNOSTIC_PATH_SAMPLE = 10;

/**
 * Collapse repeated diagnostic codes into one entry per code and severity. A
 * large repository can report the same detector code for hundreds of files, and
 * an unbounded list of near-identical entries buries every other diagnostic.
 * The count and a bounded path sample stay in the message so the published
 * report contract is unchanged; the first entry is kept verbatim as the
 * representative detail. Insertion order is preserved so the report stays
 * byte-stable for its fingerprint.
 */
function aggregateDiagnostics(
  diagnostics: readonly CoverageDiagnostic[],
): CoverageDiagnostic[] {
  const groups = new Map<string, CoverageDiagnostic[]>();
  for (const diagnostic of diagnostics) {
    const key = JSON.stringify([diagnostic.code, diagnostic.severity]);
    const group = groups.get(key);
    if (group === undefined) groups.set(key, [diagnostic]);
    else group.push(diagnostic);
  }
  return [...groups.values()].map((group) => {
    const first = group[0] as CoverageDiagnostic;
    if (group.length === 1) return first;
    const paths = group
      .map((diagnostic) => diagnostic.path)
      .filter((path): path is string => path !== undefined);
    const sample = paths.slice(0, AGGREGATED_DIAGNOSTIC_PATH_SAMPLE);
    return {
      code: first.code,
      message: `${group.length} files reported this diagnostic; the first is representative: ${first.message}${
        sample.length === 0
          ? ""
          : ` Sampled paths (${sample.length} of ${paths.length}): ${sample.join(", ")}.`
      }`,
      severity: first.severity,
    };
  });
}

function isClaimDocument(path: string): boolean {
  return (
    path === ".github/ai-model-lifecycle.yml" ||
    path.startsWith(".github/ai-model-evidence/")
  );
}

export function detectSnapshot(snapshot: GitTreeSnapshot, feed: V3FeedIndex): DetectionResult {
  const candidates = lexicalCandidates(feed);
  const automaton = buildAutomaton(candidates);
  const evidence: EvidenceFact[] = [];
  const consumedEnvironmentSelectors: ConsumedEnvironmentSelector[] = [];
  const diagnostics: CoverageDiagnostic[] = snapshot.diagnostics
    .filter((diagnostic) => diagnostic.coverageImpact === "partial")
    .map((diagnostic) => ({
      code: diagnostic.code,
      message: `${diagnostic.displayPath}: ${diagnostic.code}`,
      path: diagnostic.displayPath,
      severity: "partial" as const,
    }));
  let partial = snapshot.scanStatus === "partial";
  const unsupportedFrameworkImportsByFramework =
    new Map<string, UnsupportedFrameworkImportRecord>();
  for (const entry of snapshot.entries) {
    if (entry.content.state !== "available" || entry.kind === "symlink") continue;
    if (isClaimDocument(entry.displayPath)) continue;
    let source: string;
    try {
      source = new TextDecoder("utf-8", { fatal: true }).decode(entry.content.bytes);
    } catch {
      if (supportedSemanticPath(entry.displayPath)) {
        partial = true;
        diagnostics.push({
          code: "invalid-detector-encoding",
          message: "A published semantic detector could not process this non-UTF-8 blob.",
          path: entry.displayPath,
          severity: "partial",
        });
      }
      continue;
    }
    const scope = classifyEvidenceScope(entry.displayPath, true);
    const extension = extname(entry.displayPath.toLowerCase());
    let semantic: EvidenceFact[] = [];
    let literalSpans: SemanticLiteralSpan[] = [];
    let tokenizationIssue: TokenizationIssue | undefined;
    let semanticLanguage: "javascript" | "python" | "hcl" | undefined;
    let frameworkImports: readonly { frameworkId: string; facade: boolean }[] = [];
    if (JS_EXTENSIONS.has(extension)) {
      semanticLanguage = "javascript";
      const detected = detectSdkCalls(
        source,
        entry.displayPath,
        entry.objectId,
        "javascript",
        scope,
        JSX_EXTENSIONS.has(extension),
      );
      semantic = detected.facts;
      literalSpans = detected.literalSpans;
      tokenizationIssue = detected.tokenizationIssue;
      consumedEnvironmentSelectors.push(...detected.consumedEnvironmentSelectors);
      frameworkImports = detected.unsupportedFrameworkImports;
    } else if (extension === ".py") {
      semanticLanguage = "python";
      const detected = detectSdkCalls(source, entry.displayPath, entry.objectId, "python", scope);
      semantic = detected.facts;
      literalSpans = detected.literalSpans;
      tokenizationIssue = detected.tokenizationIssue;
      consumedEnvironmentSelectors.push(...detected.consumedEnvironmentSelectors);
      frameworkImports = detected.unsupportedFrameworkImports;
    } else if (HCL_EXTENSIONS.has(extension)) {
      semanticLanguage = "hcl";
      const detected = detectTerraform(source, entry.displayPath, entry.objectId, scope);
      semantic = detected.facts;
      tokenizationIssue = detected.tokenizationIssue;
    }
    if (tokenizationIssue !== undefined && semanticLanguage !== undefined) {
      diagnostics.push(
        tokenizationFidelityDiagnostic(entry.displayPath, semanticLanguage, tokenizationIssue),
      );
    }
    recordUnsupportedFrameworks(
      unsupportedFrameworkImportsByFramework,
      frameworkImports,
      entry.displayPath,
    );
    const lexical = lexicalFacts(
      source,
      entry.displayPath,
      entry.objectId,
      candidates,
      automaton,
      literalSpans,
    );
    evidence.push(...semantic, ...lexical);
    assertEvidenceBudget(evidence.length);
  }

  if (consumedEnvironmentSelectors.length > 0) {
    const consumedNames = new Set(
      consumedEnvironmentSelectors.map((consumer) => consumer.variable),
    );
    const activeModelIds = new Set(
      feed.modelPairs
        .filter((pair) => pair.activeLifecycles.length > 0)
        .map((pair) => pair.modelId),
    );
    const assignments: EnvironmentAssignment[] = [];
    for (const entry of snapshot.entries) {
      if (entry.content.state !== "available" || entry.kind === "symlink") continue;
      const dotenv = DOTENV_PATH.test(entry.displayPath);
      const workflow = GITHUB_WORKFLOW_PATH.test(entry.displayPath);
      if (!dotenv && !workflow) continue;
      let source: string;
      try {
        source = new TextDecoder("utf-8", { fatal: true }).decode(entry.content.bytes);
      } catch {
        continue;
      }
      if (dotenv) {
        assignments.push(
          ...parseDotenvAssignments(
            source,
            entry.displayPath,
            entry.objectId,
            consumedNames,
            activeModelIds,
          ),
        );
      } else {
        const parsed = parseGithubWorkflowAssignments(
          source,
          entry.displayPath,
          entry.objectId,
          consumedNames,
          activeModelIds,
        );
        assignments.push(...parsed.assignments);
        if (parsed.invalid) {
          partial = true;
          diagnostics.push({
            code: "invalid-github-actions-yaml",
            message: "A tracked GitHub workflow could not be parsed for static environment bindings.",
            path: entry.displayPath,
            severity: "partial",
          });
        }
      }
      assertEvidenceBudget(assignments.length);
    }
    evidence.push(
      ...environmentBindingFacts(assignments, consumedEnvironmentSelectors, feed),
    );
    assertEvidenceBudget(evidence.length);
  }
  diagnostics.push(
    ...unsupportedFrameworkDiagnostics(unsupportedFrameworkImportsByFramework, evidence),
  );
  evidence.sort((left, right) => compareText(left.evidenceId, right.evidenceId));
  return {
    evidence,
    diagnostics: aggregateDiagnostics(diagnostics),
    scanStatus: partial ? "partial" : "complete",
  };
}
