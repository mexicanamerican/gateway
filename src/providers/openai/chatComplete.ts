import { ANTHROPIC, OPEN_AI } from '../../globals';
import { ContentBlockChunk } from '../../types/requestBody';
import {
  ChatCompletionResponse,
  ErrorResponse,
  ProviderConfig,
} from '../types';
import { OpenAIErrorResponseTransform } from './utils';

// TODOS: this configuration does not enforce the maximum token limit for the input parameter. If you want to enforce this, you might need to add a custom validation function or a max property to the ParameterConfig interface, and then use it in the input configuration. However, this might be complex because the token count is not a simple length check, but depends on the specific tokenization method used by the model.

export const OpenAIChatCompleteConfig: ProviderConfig = {
  model: {
    param: 'model',
    required: true,
    default: 'gpt-3.5-turbo',
  },
  messages: {
    param: 'messages',
    default: '',
  },
  functions: {
    param: 'functions',
  },
  function_call: {
    param: 'function_call',
  },
  max_tokens: {
    param: 'max_tokens',
    default: 100,
    min: 0,
  },
  temperature: {
    param: 'temperature',
    default: 1,
    min: 0,
    max: 2,
  },
  top_p: {
    param: 'top_p',
    default: 1,
    min: 0,
    max: 1,
  },
  n: {
    param: 'n',
    default: 1,
  },
  stream: {
    param: 'stream',
    default: false,
  },
  stop: {
    param: 'stop',
  },
  presence_penalty: {
    param: 'presence_penalty',
    min: -2,
    max: 2,
  },
  frequency_penalty: {
    param: 'frequency_penalty',
    min: -2,
    max: 2,
  },
  logit_bias: {
    param: 'logit_bias',
  },
  user: {
    param: 'user',
  },
  seed: {
    param: 'seed',
  },
  tools: {
    param: 'tools',
  },
  tool_choice: {
    param: 'tool_choice',
  },
  response_format: {
    param: 'response_format',
  },
  logprobs: {
    param: 'logprobs',
    default: false,
  },
  top_logprobs: {
    param: 'top_logprobs',
  },
  stream_options: {
    param: 'stream_options',
  },
  service_tier: {
    param: 'service_tier',
  },
  parallel_tool_calls: {
    param: 'parallel_tool_calls',
  },
  max_completion_tokens: {
    param: 'max_completion_tokens',
  },
  store: {
    param: 'store',
  },
  metadata: {
    param: 'metadata',
  },
  modalities: {
    param: 'modalities',
  },
  audio: {
    param: 'audio',
  },
  prediction: {
    param: 'prediction',
  },
  reasoning_effort: {
    param: 'reasoning_effort',
  },
  web_search_options: {
    param: 'web_search_options',
  },
};

export interface OpenAIChatCompleteResponse extends ChatCompletionResponse {
  system_fingerprint: string;
}

export const OpenAIChatCompleteResponseTransform: (
  response: OpenAIChatCompleteResponse | ErrorResponse,
  responseStatus: number
) => ChatCompletionResponse | ErrorResponse = (response, responseStatus) => {
  if (responseStatus !== 200 && 'error' in response) {
    return OpenAIErrorResponseTransform(response, OPEN_AI);
  }

  return response;
};

/**
 * Transforms an OpenAI-format chat completions JSON response into an array of formatted OpenAI compatible text/event-stream chunks.
 *
 * @param {Object} response - The OpenAIChatCompleteResponse object.
 * @param {string} provider - The provider string.
 * @returns {Array<string>} - An array of formatted stream chunks.
 */
export const OpenAIChatCompleteJSONToStreamResponseTransform: (
  response: OpenAIChatCompleteResponse,
  provider: string
) => Array<string> = (response, provider) => {
  const streamChunkArray: Array<string> = [];
  const { id, model, system_fingerprint, choices, citations } = response;

  const {
    prompt_tokens,
    completion_tokens,
    cache_read_input_tokens,
    cache_creation_input_tokens,
    num_search_queries,
  } = response.usage || {};

  let total_tokens;
  if (prompt_tokens && completion_tokens)
    total_tokens = prompt_tokens + completion_tokens;

  const shouldSendCacheUsage =
    provider === ANTHROPIC &&
    (Number.isInteger(cache_read_input_tokens) ||
      Number.isInteger(cache_creation_input_tokens));

  const streamChunkTemplate: Record<string, any> = {
    id,
    object: 'chat.completion.chunk',
    created: Date.now(),
    model: model || '',
    system_fingerprint: system_fingerprint || null,
    provider,
    usage: {
      ...(completion_tokens && { completion_tokens }),
      ...(prompt_tokens && { prompt_tokens }),
      ...(total_tokens && { total_tokens }),
      ...(shouldSendCacheUsage && {
        cache_read_input_tokens,
        cache_creation_input_tokens,
      }),
      ...(num_search_queries && { num_search_queries }),
    },
    ...(citations && { citations }),
  };

  for (const [index, choice] of choices.entries()) {
    if (choice.message?.content_blocks) {
      for (const [
        contentBlockIndex,
        contentBlock,
      ] of choice.message.content_blocks.entries()) {
        const contentBlockDelta: ContentBlockChunk = {
          ...contentBlock,
        } as ContentBlockChunk;
        delete contentBlockDelta.type;
        if (contentBlockDelta.text) {
          for (let i = 0; i < contentBlockDelta.text.length; i += 500) {
            const content = contentBlockDelta.text.slice(i, i + 500);
            streamChunkArray.push(
              `data: ${JSON.stringify({
                ...streamChunkTemplate,
                choices: [
                  {
                    index: index,
                    delta: {
                      role: 'assistant',
                      content,
                      content_blocks: [
                        {
                          index: contentBlockIndex,
                          delta: {
                            text: content,
                          },
                        },
                      ],
                    },
                  },
                ],
              })}\n\n`
            );
          }
        } else if (contentBlockDelta.thinking) {
          for (let i = 0; i < contentBlockDelta.thinking.length; i += 500) {
            const thinking = contentBlockDelta.thinking.slice(i, i + 500);
            streamChunkArray.push(
              `data: ${JSON.stringify({
                ...streamChunkTemplate,
                choices: [
                  {
                    index: index,
                    delta: {
                      role: 'assistant',
                      content_blocks: [
                        {
                          index: contentBlockIndex,
                          delta: {
                            thinking,
                          },
                        },
                      ],
                    },
                  },
                ],
              })}\n\n`
            );
          }
          streamChunkArray.push(
            `data: ${JSON.stringify({
              ...streamChunkTemplate,
              choices: [
                {
                  index: index,
                  delta: {
                    role: 'assistant',
                    content_blocks: [
                      {
                        index: contentBlockIndex,
                        delta: {
                          signature: contentBlockDelta.signature,
                        },
                      },
                    ],
                  },
                },
              ],
            })}\n\n`
          );
        } else if (contentBlockDelta.data) {
          for (let i = 0; i < contentBlockDelta.data.length; i += 500) {
            const data = contentBlockDelta.data.slice(i, i + 500);
            streamChunkArray.push(
              `data: ${JSON.stringify({
                ...streamChunkTemplate,
                choices: [
                  {
                    index: index,
                    delta: {
                      role: 'assistant',
                      content_blocks: [
                        {
                          index: contentBlockIndex,
                          delta: {
                            data,
                          },
                        },
                      ],
                    },
                  },
                ],
              })}\n\n`
            );
          }
        }
      }
    }

    if (
      choice.message &&
      choice.message.tool_calls &&
      choice.message.tool_calls.length
    ) {
      for (const [
        toolCallIndex,
        toolCall,
      ] of choice.message.tool_calls.entries()) {
        const toolCallNameChunk = {
          index: toolCallIndex,
          id: toolCall.id,
          type: 'function',
          function: {
            name: toolCall.function.name,
            arguments: '',
          },
        };

        const toolCallArgumentChunk = {
          index: toolCallIndex,
          function: {
            arguments: toolCall.function.arguments,
          },
        };

        streamChunkArray.push(
          `data: ${JSON.stringify({
            ...streamChunkTemplate,
            choices: [
              {
                index: index,
                delta: {
                  role: 'assistant',
                  content: null,
                  tool_calls: [toolCallNameChunk],
                },
              },
            ],
          })}\n\n`
        );

        streamChunkArray.push(
          `data: ${JSON.stringify({
            ...streamChunkTemplate,
            choices: [
              {
                index: index,
                delta: {
                  role: 'assistant',
                  tool_calls: [toolCallArgumentChunk],
                },
              },
            ],
          })}\n\n`
        );
      }
    }

    if (
      choice.message &&
      choice.message.content &&
      typeof choice.message.content === 'string' &&
      !choice.message.content_blocks
    ) {
      const inidividualWords: Array<string> = [];
      for (let i = 0; i < choice.message.content.length; i += 500) {
        inidividualWords.push(choice.message.content.slice(i, i + 500));
      }
      inidividualWords.forEach((word: string) => {
        streamChunkArray.push(
          `data: ${JSON.stringify({
            ...streamChunkTemplate,
            choices: [
              {
                index: index,
                delta: {
                  role: 'assistant',
                  content: word,
                },
                ...(choice.groundingMetadata && {
                  groundingMetadata: choice.groundingMetadata,
                }),
              },
            ],
          })}\n\n`
        );
      });
    }

    streamChunkArray.push(
      `data: ${JSON.stringify({
        ...streamChunkTemplate,
        choices: [
          {
            index: index,
            delta: {},
            finish_reason: choice.finish_reason,
          },
        ],
      })}\n\n`
    );
  }

  streamChunkArray.push(`data: [DONE]\n\n`);
  return streamChunkArray;
};
