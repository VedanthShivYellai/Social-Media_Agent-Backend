// Loads environment variables from .env into process.env
import "dotenv/config";

// External packages
import { GoogleGenAI } from "@google/genai";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import cors from "cors";
import express from "express";

// Local MCP request handler
import { handleMcpRequest as handleMcpRequest } from "./mcp-server.js";


// -----------------------------------------------------------------------------
// Application configuration
// -----------------------------------------------------------------------------

const app = express();

const PORT = process.env.PORT;
const MCP_SERVER_URL =
  process.env.MCP_SERVER_URL || `http://127.0.0.1:${PORT}/mcp`;

const FRONTEND_ORIGIN =
  "https://social-media-frontend-livid.vercel.app";


// -----------------------------------------------------------------------------
// Express middleware
// -----------------------------------------------------------------------------

app.use(
  cors({
    origin: FRONTEND_ORIGIN
  })
);

app.use(express.json());


// -----------------------------------------------------------------------------
// Gemini client
// -----------------------------------------------------------------------------

const geminiClient = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});


// -----------------------------------------------------------------------------
// MCP client and transport
// -----------------------------------------------------------------------------

const mcpClient = new Client({
  name: "social-media-posting-agent",
  version: "1.0.0"
});

const mcpClientTransport = new StreamableHTTPClientTransport(
  new URL(MCP_SERVER_URL)
);

let isMcpConnected = false;


// Connects the MCP client only once
async function ensureMcpConnection() {
  if (isMcpConnected) {
    return;
  }

  await mcpClient.connect(mcpClientTransport);

  isMcpConnected = true;
}


// -----------------------------------------------------------------------------
// MCP and Gemini conversion helpers
// -----------------------------------------------------------------------------

// Converts MCP tool definitions into Gemini function declarations
function convertMcpToolsToGeminiDeclarations(mcpTools) {
  return mcpTools.map((mcpTool) => ({
    name: mcpTool.name,
    description: mcpTool.description || "",
    parameters: mcpTool.inputSchema
  }));
}


// Extracts readable text from an MCP tool result
function extractMcpResultText(mcpResult) {
  if (mcpResult.structuredContent) {
    return JSON.stringify(mcpResult.structuredContent, null, 2);
  }

  if (!mcpResult.content || mcpResult.content.length === 0) {
    return "";
  }

  return mcpResult.content
    .map((contentItem) => {
      if (contentItem.type === "text") {
        return contentItem.text;
      }

      return JSON.stringify(contentItem);
    })
    .join("\n");
}


// Executes the MCP tools requested by Gemini
async function executeMcpToolCalls(functionCalls) {
  const toolResponses = [];

  for (const functionCall of functionCalls) {
    const toolArguments = {
      ...functionCall.args
    };

    const mcpResult = await mcpClient.callTool(
      {
        name: functionCall.name,
        arguments: toolArguments
      },
      undefined,
      {
        timeout: 100000
      }
    );

    const resultText = extractMcpResultText(mcpResult);

    toolResponses.push({
      name: functionCall.name,
      response: {
        result: resultText
      }
    });
  }

  return toolResponses;
}


// Builds the Gemini functionCall message parts
function createFunctionCallParts(functionCalls) {
  return functionCalls.map((functionCall) => ({
    functionCall: {
      name: functionCall.name,
      args: {
        ...functionCall.args
      }
    }
  }));
}


// Builds the Gemini functionResponse message parts
function createFunctionResponseParts(toolResponses) {
  return toolResponses.map((toolResponse) => ({
    functionResponse: {
      name: toolResponse.name,
      response: toolResponse.response
    }
  }));
}


// Builds the original user message sent to Gemini
function createUserMessageParts({ message, mediaItems }) {
  const messageParts = [
    {
      text: message
    }
  ];

  if (mediaItems && mediaItems.length > 0) {
    messageParts.push({
      text: `User-provided media items:\n${JSON.stringify(
        mediaItems,
        null,
        2
      )}`
    });
  }

  return messageParts;
}


// -----------------------------------------------------------------------------
// Agent configuration
// -----------------------------------------------------------------------------

const AGENT_SYSTEM_INSTRUCTION = `
You are a helpful AI social media posting assistant.

Your job is to help users create, edit, and publish Facebook Page posts.

Important rules:
- Whenever you give the final response, always say which tool was used.
- Do not publish unless the user clearly asks to publish or post.
- If the user only asks for a draft, write the draft but do not call a posting tool.
- If the user asks to post one image or one video, use facebookPostSingleMedia.
- If the user asks to post multiple images or videos, use facebookPostMultipleMedia.
- If the user provides mediaItems, use those exact media URLs and types.
- If the user wants to post but gives no caption and no media, explain that a post needs at least a caption or media.
- Do not invent image URLs, video URLs, claims, discounts, partnerships, or guarantees.
- Keep captions clear and appropriate for the platform.
- After a tool result comes back, explain the result in simple plain English.
- Do not mention internal tool names unless the user asks how the system works.
- If an error occurs, do not reveal the specific error.
- Keep error responses brief, such as: "There was an issue with the backend."
- If the user requests something unsupported by the available tools, respond kindly and clearly.

Media item format:
{
  "type": "image" or "video",
  "url": "https://example.com/media.jpg"
}
`;

const ERROR_SYSTEM_INSTRUCTION = `
Do not reveal the specific technical error.

Only tell the user that there was an issue with the backend.
Keep the response brief and do not include internal implementation details.
`;


// -----------------------------------------------------------------------------
// Main agent logic
// -----------------------------------------------------------------------------

export async function runAgent({ userMessage, mediaItems = [] }) {
  try {
    await ensureMcpConnection();

    const availableTools = await mcpClient.listTools();

    const functionDeclarations =
      convertMcpToolsToGeminiDeclarations(availableTools.tools);

    const userMessageParts = createUserMessageParts({
      message: userMessage,
      mediaItems
    });

    // First Gemini call: determines whether a tool is needed
    const initialGeminiResponse =
      await geminiClient.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [
          {
            role: "user",
            parts: userMessageParts
          }
        ],
        config: {
          systemInstruction: AGENT_SYSTEM_INSTRUCTION,
          tools: [
            {
              functionDeclarations
            }
          ]
        }
      });

    const requestedFunctionCalls =
      initialGeminiResponse.functionCalls;

    // Return a normal response when Gemini does not request a tool
    if (
      !requestedFunctionCalls ||
      requestedFunctionCalls.length === 0
    ) {
      return initialGeminiResponse.text;
    }

    const toolResponses = await executeMcpToolCalls(
      requestedFunctionCalls
    );

    const functionCallParts = createFunctionCallParts(
      requestedFunctionCalls
    );

    const functionResponseParts =
      createFunctionResponseParts(toolResponses);

    // Second Gemini call: explains the tool result
    const finalGeminiResponse =
      await geminiClient.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [
          {
            role: "user",
            parts: userMessageParts
          },
          {
            role: "model",
            parts: functionCallParts
          },
          {
            role: "user",
            parts: functionResponseParts
          }
        ],
        config: {
          systemInstruction: AGENT_SYSTEM_INSTRUCTION,
          tools: [
            {
              functionDeclarations
            }
          ]
        }
      });

    return finalGeminiResponse.text;
  } catch (error) {
    console.error("Agent execution failed:", error);

    const fallbackResponse =
      await geminiClient.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [
          {
            role: "user",
            parts: [
              {
                text: error.message
              }
            ]
          }
        ],
        config: {
          systemInstruction: ERROR_SYSTEM_INSTRUCTION
        }
      });

    return fallbackResponse.text;
  }
}


// -----------------------------------------------------------------------------
// HTTP routes
// -----------------------------------------------------------------------------

app.post("/agent", async (request, response) => {
  try {
    const agentReply = await runAgent({
      userMessage: request.body.message,
      mediaItems: request.body.mediaItems
    });

    response.status(200).json({
      agentResponse: agentReply
    });
  } catch (error) {
    console.error("Agent route failed:", error);

    response.status(500).json({
      errorMessage: "There was an issue with the backend."
    });
  }
});

app.post("/mcp", handleMcpRequest);


// -----------------------------------------------------------------------------
// Start server
// -----------------------------------------------------------------------------

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});