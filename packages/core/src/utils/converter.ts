import type { ChatCompletionMessageParam as OpenAIMessage } from "openai/resources/chat/completions";
import type { MessageParam as AnthropicMessage } from "@anthropic-ai/sdk/resources/messages";
import type { ChatCompletionTool } from "openai/resources/chat/completions";
import type { Tool as AnthropicTool } from "@anthropic-ai/sdk/resources/messages";
import {
  UnifiedMessage,
  UnifiedChatRequest,
  UnifiedTool,
  OpenAIChatRequest,
  AnthropicChatRequest,
  ConversionOptions,
} from "../types/llm";

// Simple logger function
function log(...args: any[]) {
  // Can be extended to use a proper logger
  console.log(...args);
}

export function convertToolsToOpenAI(
  tools: UnifiedTool[]
): ChatCompletionTool[] {
  return tools.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.function.name,
      description: tool.function.description,
      parameters: tool.function.parameters,
    },
  }));
}

export function convertToolsToAnthropic(tools: UnifiedTool[]): AnthropicTool[] {
  return tools.map((tool) => ({
    name: tool.function.name,
    description: tool.function.description,
    input_schema: tool.function.parameters,
  }));
}

export function convertToolsFromOpenAI(
  tools: ChatCompletionTool[]
): UnifiedTool[] {
  return tools.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.function.name,
      description: tool.function.description || "",
      parameters: tool.function.parameters as any,
    },
  }));
}

export function convertToolsFromAnthropic(
  tools: AnthropicTool[]
): UnifiedTool[] {
  return tools.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description || "",
      parameters: tool.input_schema as any,
    },
  }));
}

export function convertToOpenAI(
  request: UnifiedChatRequest
): OpenAIChatRequest {
  const messages: OpenAIMessage[] = [];
  const toolResponsesQueue: Map<string, any> = new Map(); // For storing tool responses

  request.messages.forEach((msg) => {
    if (msg.role === "tool" && msg.tool_call_id) {
      if (!toolResponsesQueue.has(msg.tool_call_id)) {
        toolResponsesQueue.set(msg.tool_call_id, []);
      }
      toolResponsesQueue.get(msg.tool_call_id).push({
        role: "tool",
        content: msg.content,
        tool_call_id: msg.tool_call_id,
      });
    }
  });

  for (let i = 0; i < request.messages.length; i++) {
    const msg = request.messages[i];

    if (msg.role === "tool") {
      continue;
    }

    const message: any = {
      role: msg.role,
      content: msg.content,
    };

    if (msg.tool_calls && msg.tool_calls.length > 0) {
      message.tool_calls = msg.tool_calls;
      if (message.content === null) {
        message.content = null;
      }
    }

    // Convert thinking to reasoning_content for DeepSeek API compatibility
    if (msg.role === "assistant" && msg.thinking?.content) {
      message.reasoning_content = msg.thinking.content;
    }

    messages.push(message);

    if (
      msg.role === "assistant" &&
      msg.tool_calls &&
      msg.tool_calls.length > 0
    ) {
      for (const toolCall of msg.tool_calls) {
        if (toolResponsesQueue.has(toolCall.id)) {
          const responses = toolResponsesQueue.get(toolCall.id);

          responses.forEach((response) => {
            messages.push(response);
          });

          toolResponsesQueue.delete(toolCall.id);
        } else {
          messages.push({
            role: "tool",
            content: JSON.stringify({
              success: true,
              message: "Tool call executed successfully",
              tool_call_id: toolCall.id,
            }),
            tool_call_id: toolCall.id,
          } as any);
        }
      }
    }
  }

  if (toolResponsesQueue.size > 0) {
    for (const [id, responses] of toolResponsesQueue.entries()) {
      responses.forEach((response) => {
        messages.push(response);
      });
    }
  }

  const result: any = {
    messages,
    model: request.model,
    max_tokens: request.max_tokens,
    temperature: request.temperature,
    stream: request.stream,
  };

  if (request.tools && request.tools.length > 0) {
    result.tools = convertToolsToOpenAI(request.tools);
    if (request.tool_choice) {
      if (request.tool_choice === "auto" || request.tool_choice === "none") {
        result.tool_choice = request.tool_choice;
      } else {
        result.tool_choice = {
          type: "function",
          function: { name: request.tool_choice },
        };
      }
    }
  }

  return result;
}



function isToolCallContent(content: string): boolean {
  try {
    const parsed = JSON.parse(content);
    return (
      Array.isArray(parsed) &&
      parsed.some((item) => item.type === "tool_use" && item.id && item.name)
    );
  } catch {
    return false;
  }
}

export function convertFromOpenAI(
  request: OpenAIChatRequest
): UnifiedChatRequest {
  const messages: UnifiedMessage[] = request.messages.map((msg) => {
    if (
      msg.role === "assistant" &&
      typeof msg.content === "string" &&
      isToolCallContent(msg.content)
    ) {
      try {
        const toolCalls = JSON.parse(msg.content);
        const convertedToolCalls = toolCalls.map((call: any) => ({
          id: call.id,
          type: "function" as const,
          function: {
            name: call.name,
            arguments: JSON.stringify(call.input || {}),
          },
        }));

        return {
          role: msg.role as "user" | "assistant" | "system",
          content: null,
          tool_calls: convertedToolCalls,
        };
      } catch (error) {
        return {
          role: msg.role as "user" | "assistant" | "system",
          content: msg.content,
        };
      }
    }

    if (msg.role === "tool") {
      return {
        role: msg.role as "tool",
        content:
          typeof msg.content === "string"
            ? msg.content
            : JSON.stringify(msg.content),
        tool_call_id: (msg as any).tool_call_id,
      };
    }

    return {
      role: msg.role as "user" | "assistant" | "system",
      content:
        typeof msg.content === "string"
          ? msg.content
          : JSON.stringify(msg.content),
      ...((msg as any).tool_calls && { tool_calls: (msg as any).tool_calls }),
    };
  });

  const result: UnifiedChatRequest = {
    messages,
    model: request.model,
    max_tokens: request.max_tokens,
    temperature: request.temperature,
    stream: request.stream,
  };

  if (request.tools && request.tools.length > 0) {
    result.tools = convertToolsFromOpenAI(request.tools);

    if (request.tool_choice) {
      if (typeof request.tool_choice === "string") {
        result.tool_choice = request.tool_choice;
      } else if (request.tool_choice.type === "function") {
        result.tool_choice = request.tool_choice.function.name;
      }
    }
  }

  return result;
}

export function convertFromAnthropic(
  request: AnthropicChatRequest
): UnifiedChatRequest {
  const messages: UnifiedMessage[] = [];

  if (request.system) {
    messages.push({
      role: "system",
      content: request.system,
    });
  }

  for (let i = 0; i < request.messages.length; i++) {
    const msg = request.messages[i];

    if (typeof msg.content === "string") {
      messages.push({
        role: msg.role,
        content: msg.content,
      });
    } else if (Array.isArray(msg.content)) {
      const textBlocks: string[] = [];
      const toolCalls: any[] = [];
      const toolResults: any[] = [];
      let thinkingContent: string | null = null;
      let thinkingSignature: string | null = null;

      msg.content.forEach((block) => {
        if (block.type === "text") {
          textBlocks.push(block.text);
        } else if (block.type === "thinking") {
          thinkingContent = (block as any).thinking || null;
          thinkingSignature = (block as any).signature || null;
        } else if (block.type === "tool_use") {
          toolCalls.push({
            id: block.id,
            type: "function" as const,
            function: {
              name: block.name,
              arguments: JSON.stringify(block.input || {}),
            },
          });
        } else if (block.type === "tool_result") {
          toolResults.push(block);
        }
      });

      if (toolResults.length > 0) {
        toolResults.forEach((toolResult) => {
          messages.push({
            role: "tool",
            content:
              typeof toolResult.content === "string"
                ? toolResult.content
                : JSON.stringify(toolResult.content),
            tool_call_id: toolResult.tool_use_id,
          });
        });
      } else {
        const message: UnifiedMessage = {
          role: msg.role,
          content: textBlocks.join("") || null,
        };

        if (toolCalls.length > 0) {
          message.tool_calls = toolCalls;
          if (textBlocks.length === 0) {
            message.content = null;
          }
        }

        // Add thinking for assistant messages
        if (msg.role === "assistant" && thinkingContent) {
          message.thinking = {
            content: thinkingContent,
            signature: thinkingSignature || undefined,
          };
        }

        messages.push(message);
      }
    } else {
      messages.push({
        role: msg.role,
        content: JSON.stringify(msg.content),
      });
    }
  }

  const result: UnifiedChatRequest = {
    messages,
    model: request.model,
    max_tokens: request.max_tokens,
    temperature: request.temperature,
    stream: request.stream,
  };

  if (request.tools && request.tools.length > 0) {
    result.tools = convertToolsFromAnthropic(request.tools);

    if (request.tool_choice) {
      if (request.tool_choice.type === "auto") {
        result.tool_choice = "auto";
      } else if (request.tool_choice.type === "tool") {
        result.tool_choice = request.tool_choice.name;
      }
    }
  }

  return result;
}

export function convertRequest(
  request: OpenAIChatRequest | AnthropicChatRequest | UnifiedChatRequest,
  options: ConversionOptions
): OpenAIChatRequest | AnthropicChatRequest {
  let unifiedRequest: UnifiedChatRequest;
  if (options.sourceProvider === "openai") {
    unifiedRequest = convertFromOpenAI(request as OpenAIChatRequest);
  } else if (options.sourceProvider === "anthropic") {
    unifiedRequest = convertFromAnthropic(request as AnthropicChatRequest);
  } else {
    unifiedRequest = request as UnifiedChatRequest;
  }

  if (options.targetProvider === "openai") {
    return convertToOpenAI(unifiedRequest);
  } else {
    // For now, return unified request since Anthropic format is similar
    return unifiedRequest as any;
  }
}
