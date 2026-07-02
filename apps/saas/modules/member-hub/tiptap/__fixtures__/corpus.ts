/** Small hand-picked corpus of real Circle tiptap_body shapes for A/B rendering. */
export const CORPUS: Array<{ label: string; tiptapBody: unknown }> = [
	{
		label: "text + strike + heading",
		tiptapBody: {
			body: {
				type: "doc",
				content: [
					{ type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Heading" }] },
					{
						type: "paragraph",
						content: [
							{ type: "text", text: "normal " },
							{ type: "text", text: "struck", marks: [{ type: "strike" }] },
						],
					},
				],
			},
			sgids_to_object_map: {},
		},
	},
	{
		label: "poll (captured shape)",
		tiptapBody: {
			body: { type: "doc", content: [{ type: "poll", attrs: { sgid: "P1" } }] },
			sgids_to_object_map: {
				P1: {
					type: "poll",
					title: "Who is amazing",
					status: "active",
					poll_options: [
						{ id: 1, value: "Me" },
						{ id: 2, value: "Him" },
					],
				},
			},
		},
	},
	{
		label: "right-aligned image",
		tiptapBody: {
			body: {
				type: "doc",
				content: [{ type: "image", attrs: { url: "https://placehold.co/300", alignment: "right" } }],
			},
			sgids_to_object_map: {},
		},
	},
];
