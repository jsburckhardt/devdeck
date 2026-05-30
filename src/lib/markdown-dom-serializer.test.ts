import { describe, expect, it } from "vitest";
import { serializeMarkdownDom } from "./markdown-dom-serializer";

function serialize(html: string): string {
  const root = document.createElement("article");
  root.innerHTML = html;
  return serializeMarkdownDom(root);
}

describe("serializeMarkdownDom", () => {
  it("serializes headings and paragraphs", () => {
    expect(serialize("<h1>Hello</h1><p>World</p>")).toBe("# Hello\n\nWorld\n");
  });

  it("serializes inline formatting, links, inline code, and images", () => {
    expect(
      serialize(
        `<p><strong>Bold</strong> <em>italic</em> <a href="https://example.com">link</a> <code>x</code> <img alt="Alt" src="img.png"></p>`,
      ),
    ).toBe("**Bold** *italic* [link](https://example.com) `x` ![Alt](img.png)\n");
  });

  it("serializes unordered, ordered, and task lists", () => {
    expect(
      serialize(
        `<ul><li>One</li><li><input type="checkbox" checked> Done</li><li><input type="checkbox"> Todo</li></ul><ol><li>First</li><li>Second</li></ol>`,
      ),
    ).toBe("- One\n- [x] Done\n- [ ] Todo\n\n1. First\n2. Second\n");
  });

  it("serializes blockquotes, tables, horizontal rules, and fenced code", () => {
    expect(
      serialize(
        `<blockquote><p>Quote</p></blockquote><table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table><hr><pre class="hljs"><code class="hljs language-typescript"><span class="hljs-keyword">const</span> x = 1;</code></pre>`,
      ),
    ).toBe(
      "> Quote\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n---\n\n```typescript\nconst x = 1;\n```\n",
    );
  });

  it("serializes Mermaid containers from data-mermaid-source without SVG", () => {
    const source = "graph TD\n  A --> B";
    const encoded = btoa(String.fromCharCode(...new TextEncoder().encode(source)));

    expect(
      serialize(
        `<div class="mermaid-block" data-mermaid-source="${encoded}"><svg><text>diagram</text></svg></div>`,
      ),
    ).toBe("```mermaid\ngraph TD\n  A --> B\n```\n");
  });

  it("serializes highlighted code as text only without span markup", () => {
    const markdown = serialize(
      `<pre class="hljs"><code class="hljs language-javascript"><span class="hljs-keyword">const</span> value = <span class="hljs-number">1</span>;</code></pre>`,
    );

    expect(markdown).toBe("```javascript\nconst value = 1;\n```\n");
    expect(markdown).not.toContain("span");
    expect(markdown).not.toContain("hljs");
  });
});
