import React from "react";
import { describe, expect, it, vi } from "vitest";

import { linkifyText } from "./linkify";

type AnchorProps = React.AnchorHTMLAttributes<HTMLAnchorElement> & {
  children: string;
  onClick: (event: { stopPropagation: () => void }) => void;
};

function expectAnchor(node: React.ReactNode) {
  expect(React.isValidElement(node)).toBe(true);
  if (!React.isValidElement(node)) {
    throw new Error("Expected URL node to be a React element");
  }
  return node as React.ReactElement<AnchorProps>;
}

describe("linkifyText", () => {
  it("returns plain text when no URLs are present", () => {
    expect(linkifyText("No links here")).toEqual(["No links here"]);
  });

  it("converts a URL into an anchor element", () => {
    const nodes = linkifyText("Visit https://example.com now", "custom-link");

    expect(nodes[0]).toBe("Visit ");
    expect(nodes[2]).toBe(" now");

    const link = expectAnchor(nodes[1]);

    expect(link.props.href).toBe("https://example.com");
    expect(link.props.target).toBe("_blank");
    expect(link.props.rel).toBe("noopener noreferrer");
    expect(link.props.className).toBe("custom-link");
    expect(link.props.children).toBe("https://example.com");
  });

  it("converts multiple URLs while preserving surrounding text", () => {
    const nodes = linkifyText("A https://a.example B https://b.example C");
    const links = nodes.filter(React.isValidElement).map(expectAnchor);

    expect(nodes[0]).toBe("A ");
    expect(nodes[2]).toBe(" B ");
    expect(nodes[4]).toBe(" C");
    expect(links).toHaveLength(2);
    expect(links.map((link) => link.props.href)).toEqual([
      "https://a.example",
      "https://b.example",
    ]);
  });

  it("stops click propagation on generated anchors", () => {
    const [, linkNode] = linkifyText("Open https://example.com");
    const link = expectAnchor(linkNode);

    const event = { stopPropagation: vi.fn() };
    link.props.onClick(event);

    expect(event.stopPropagation).toHaveBeenCalledOnce();
  });
});
