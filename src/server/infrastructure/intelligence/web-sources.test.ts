import type { BetaContentBlock } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { ResponseOutputItem } from "openai/resources/responses/responses";
import { describe, expect, it } from "vitest";
import { anthropicFindings } from "./anthropic-research";
import { openAiSources } from "./openai-research";
import { uniqueSources } from "./web-sources";

// Response shapes follow the SDK type definitions; they are not recordings of live calls.

describe("anthropicFindings", () => {
  it("collects search results and citations, and skips a search that returned an error", () => {
    const content = [
      {
        type: "web_search_tool_result",
        tool_use_id: "t1",
        content: [
          {
            type: "web_search_result",
            url: "https://a.example",
            title: "A",
            encrypted_content: "",
            page_age: null,
          },
        ],
      },
      {
        type: "web_search_tool_result",
        tool_use_id: "t2",
        content: { type: "web_search_tool_result_error", error_code: "max_uses_exceeded" },
      },
      {
        type: "text",
        text: "Finding one.",
        citations: [
          {
            type: "web_search_result_location",
            url: "https://b.example",
            title: "B",
            cited_text: "",
            encrypted_index: "",
          },
        ],
      },
      { type: "text", text: " Finding two.", citations: null },
    ] as unknown as BetaContentBlock[];
    expect(anthropicFindings(content)).toEqual({
      text: "Finding one. Finding two.",
      found: [
        { url: "https://a.example", title: "A" },
        { url: "https://b.example", title: "B" },
      ],
    });
  });
});

describe("openAiSources", () => {
  it("reads url citations from the answer and sources from search calls", () => {
    const output = [
      {
        type: "web_search_call",
        id: "ws",
        status: "completed",
        action: {
          type: "search",
          query: "q",
          sources: [{ type: "url", url: "https://c.example" }],
        },
      },
      {
        type: "message",
        id: "m",
        role: "assistant",
        status: "completed",
        content: [
          {
            type: "output_text",
            text: "x",
            annotations: [
              {
                type: "url_citation",
                url: "https://d.example",
                title: "D",
                start_index: 0,
                end_index: 1,
              },
            ],
          },
        ],
      },
    ] as unknown as ResponseOutputItem[];
    expect(openAiSources(output)).toEqual([
      { url: "https://c.example", title: null },
      { url: "https://d.example", title: "D" },
    ]);
  });
});

describe("uniqueSources", () => {
  it("keeps one entry per URL, preferring a real title over the bare URL", () => {
    expect(
      uniqueSources([
        { url: "https://c.example", title: "C" },
        { url: "https://c.example", title: null },
        { url: "https://e.example", title: "  " },
      ]),
    ).toEqual([
      { url: "https://c.example", title: "C" },
      { url: "https://e.example", title: "https://e.example" },
    ]);
  });
});
