function normalizeText(text: string): string {
  return text.replace(/\u00a0/g, " ");
}

function trimBlankLines(value: string): string {
  return value.replace(/\n{3,}/g, "\n\n").trim();
}

function decodeBase64Utf8(value: string): string {
  if (typeof atob !== "function") throw new Error("Base64 decoding is unavailable");

  const binString = atob(value);
  const bytes = Uint8Array.from(binString, (char) => char.codePointAt(0)!);
  return new TextDecoder().decode(bytes);
}

function getCodeLanguage(code: Element | null): string {
  if (!code) return "";
  for (const className of Array.from(code.classList)) {
    if (className.startsWith("language-")) {
      const language = className.slice("language-".length);
      return language === "plaintext" ? "" : language;
    }
  }
  return "";
}

function escapeTableCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ").trim();
}

function serializeInlineChildren(node: Node): string {
  return Array.from(node.childNodes).map(serializeInlineNode).join("");
}

function serializeInlineNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return normalizeText(node.textContent ?? "");
  if (node.nodeType !== Node.ELEMENT_NODE) return "";

  const element = node as Element;
  const tagName = element.tagName.toLowerCase();

  switch (tagName) {
    case "strong":
    case "b":
      return `**${serializeInlineChildren(element)}**`;
    case "em":
    case "i":
      return `*${serializeInlineChildren(element)}*`;
    case "a": {
      const href = element.getAttribute("href") ?? "";
      return `[${serializeInlineChildren(element)}](${href})`;
    }
    case "code":
      return `\`${normalizeText(element.textContent ?? "")}\``;
    case "img": {
      const alt = element.getAttribute("alt") ?? "";
      const src = element.getAttribute("src") ?? "";
      return `![${alt}](${src})`;
    }
    case "br":
      return "  \n";
    case "input":
    case "svg":
      return "";
    default:
      return serializeInlineChildren(element);
  }
}

function serializeListItem(item: HTMLLIElement, index: number, ordered: boolean): string {
  const checkbox = item.querySelector(":scope > input[type=checkbox]") as HTMLInputElement | null;
  const prefix = ordered ? `${index + 1}. ` : "- ";
  const taskPrefix = checkbox ? `[${checkbox.checked ? "x" : " "}] ` : "";
  const parts: string[] = [];

  for (const child of Array.from(item.childNodes)) {
    if (child === checkbox) continue;
    if (child.nodeType === Node.ELEMENT_NODE) {
      const childElement = child as Element;
      const childTag = childElement.tagName.toLowerCase();
      if (childTag === "ul" || childTag === "ol") {
        const nested = serializeBlockNode(childElement);
        if (nested)
          parts.push(
            nested
              .split("\n")
              .map((line) => `  ${line}`)
              .join("\n"),
          );
        continue;
      }
    }

    if (child.nodeType === Node.ELEMENT_NODE && isBlockElement(child as Element)) {
      const block = serializeBlockNode(child);
      if (block) parts.push(block);
    } else {
      const inline = serializeInlineNode(child);
      if (inline) parts.push(inline);
    }
  }

  const content = parts.join("").trim();
  return `${prefix}${taskPrefix}${content}`.trimEnd();
}

function serializeTable(table: Element): string {
  const rows = Array.from(table.querySelectorAll("tr"));
  if (rows.length === 0) return "";

  const serializedRows = rows.map((row) =>
    Array.from(row.querySelectorAll("th,td")).map((cell) =>
      escapeTableCell(serializeInlineChildren(cell)),
    ),
  );
  const columnCount = Math.max(...serializedRows.map((row) => row.length));
  const normalizedRows = serializedRows.map((row) => [
    ...row,
    ...Array.from({ length: columnCount - row.length }, () => ""),
  ]);
  const header = normalizedRows[0];
  const body = normalizedRows.slice(1);
  const delimiter = Array.from({ length: columnCount }, () => "---");
  const formatRow = (row: string[]) => `| ${row.join(" | ")} |`;

  return [formatRow(header), formatRow(delimiter), ...body.map(formatRow)].join("\n");
}

function isBlockElement(element: Element): boolean {
  return [
    "address",
    "article",
    "aside",
    "blockquote",
    "div",
    "dl",
    "fieldset",
    "figcaption",
    "figure",
    "footer",
    "form",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "header",
    "hr",
    "li",
    "main",
    "nav",
    "ol",
    "p",
    "pre",
    "section",
    "table",
    "ul",
  ].includes(element.tagName.toLowerCase());
}

function serializeBlockChildren(node: Node): string {
  return Array.from(node.childNodes).map(serializeBlockNode).filter(Boolean).join("\n\n");
}

function serializeBlockNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return normalizeText(node.textContent ?? "").trim();
  if (node.nodeType !== Node.ELEMENT_NODE) return "";

  const element = node as Element;
  const tagName = element.tagName.toLowerCase();
  const mermaidSource = element.getAttribute("data-mermaid-source");
  if (mermaidSource) {
    try {
      return `\`\`\`mermaid\n${decodeBase64Utf8(mermaidSource).trimEnd()}\n\`\`\``;
    } catch {
      return "";
    }
  }

  switch (tagName) {
    case "h1":
    case "h2":
    case "h3":
    case "h4":
    case "h5":
    case "h6":
      return `${"#".repeat(Number(tagName[1]))} ${serializeInlineChildren(element).trim()}`;
    case "p":
      return serializeInlineChildren(element).trim();
    case "blockquote":
      return serializeBlockChildren(element)
        .split("\n")
        .map((line) => (line ? `> ${line}` : ">"))
        .join("\n");
    case "ul":
    case "ol":
      return Array.from(element.children)
        .filter((child): child is HTMLLIElement => child.tagName.toLowerCase() === "li")
        .map((item, index) => serializeListItem(item, index, tagName === "ol"))
        .join("\n");
    case "pre": {
      const code = element.querySelector("code");
      const language = getCodeLanguage(code);
      const text = normalizeText((code ?? element).textContent ?? "").replace(/\n$/, "");
      return `\`\`\`${language}\n${text}\n\`\`\``;
    }
    case "table":
      return serializeTable(element);
    case "hr":
      return "---";
    case "img":
      return serializeInlineNode(element);
    case "article":
    case "div":
    case "section":
      return serializeBlockChildren(element);
    default:
      if (isBlockElement(element)) return serializeBlockChildren(element);
      return serializeInlineChildren(element).trim();
  }
}

export function serializeMarkdownDom(root: HTMLElement): string {
  const markdown = trimBlankLines(serializeBlockChildren(root));
  return markdown ? `${markdown}\n` : "";
}
