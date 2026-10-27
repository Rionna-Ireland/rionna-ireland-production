"use client";

import { mdxComponents } from "@blog/lib/mdx-components";
import { MDXContent } from "@content-collections/mdx/react";
import { slugifyHeadline } from "@shared/lib/content";
import { type ReactNode, isValidElement } from "react";

function textOf(node: ReactNode): string {
	if (typeof node === "string" || typeof node === "number") return String(node);
	if (Array.isArray(node)) return node.map(textOf).join("");
	if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
	return "";
}

/** Legal MDX body; h2/h3 get the ids the table of contents links to. */
export function LegalContent({ content }: { content: string }) {
	return (
		<div className="prose max-w-2xl text-ink prose-headings:font-display prose-headings:text-ink prose-p:text-ink prose-li:text-ink prose-a:text-plum prose-strong:text-ink">
			<MDXContent
				code={content}
				components={{
					a: mdxComponents.a,
					h2: ({ children }) => (
						<h2 id={slugifyHeadline(textOf(children))} className="scroll-mt-32">
							{children}
						</h2>
					),
					h3: ({ children }) => (
						<h3 id={slugifyHeadline(textOf(children))} className="scroll-mt-32">
							{children}
						</h3>
					),
				}}
			/>
		</div>
	);
}
