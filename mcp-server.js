// Loads environment variables from the .env file into process.env
import "dotenv/config";

// Imports the MCP server class
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// Imports the MCP HTTP server transport
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

// Imports Zod for validating tool input schemas
import { z } from "zod";


// -----------------------------------------------------------------------------
// Environment configuration
// -----------------------------------------------------------------------------

// Meta Graph API version
const META_GRAPH_API_VERSION =
  process.env.FACEBOOK_GRAPH_API_VERSION || "v25.0";

// Facebook Page identifier
const facebookPageId = process.env.FACEBOOK_PAGE_ID;

// Facebook Page access token
const facebookPageAccessToken =
  process.env.FACEBOOK_PAGE_ACCESS_TOKEN;

// Instagram professional account identifier
const instagramAccountId =
  process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;

// Instagram access token, with the Facebook Page token as a fallback
const instagramAccessToken =
  process.env.INSTAGRAM_ACCESS_TOKEN ||
  facebookPageAccessToken;


// -----------------------------------------------------------------------------
// MCP result helpers
// -----------------------------------------------------------------------------

// Creates a successful MCP response
function createSuccessResponse(
  message,
  structuredContent = null
) {
  const response = {
    content: [
      {
        type: "text",
        text: message
      }
    ]
  };

  if (structuredContent) {
    response.structuredContent = structuredContent;
  }

  return response;
}


// Creates an MCP error response
function createFailureResponse(
  message,
  structuredContent = null
) {
  const response = {
    isError: true,
    content: [
      {
        type: "text",
        text: message
      }
    ]
  };

  if (structuredContent) {
    response.structuredContent = structuredContent;
  }

  return response;
}


// Checks whether a value contains non-empty text
function isNonEmptyString(value) {
  return (
    typeof value === "string" &&
    value.trim().length > 0
  );
}


// -----------------------------------------------------------------------------
// Configuration validation
// -----------------------------------------------------------------------------

// Checks whether the required Facebook configuration exists
function checkFacebookConfiguration() {
  if (!facebookPageId || !facebookPageAccessToken) {
    return {
      success: false,
      error: "FACEBOOK_CONFIG_MISSING",
      message:
        "Missing FACEBOOK_PAGE_ID or FACEBOOK_PAGE_ACCESS_TOKEN environment variable."
    };
  }

  return {
    success: true
  };
}


// Checks whether the required Instagram configuration exists
function checkInstagramConfiguration() {
  if (!instagramAccountId || !instagramAccessToken) {
    return {
      success: false,
      error: "INSTAGRAM_CONFIG_MISSING",
      message:
        "Missing INSTAGRAM_BUSINESS_ACCOUNT_ID or INSTAGRAM_ACCESS_TOKEN environment variable."
    };
  }

  return {
    success: true
  };
}


// -----------------------------------------------------------------------------
// Graph API URL helpers
// -----------------------------------------------------------------------------

// Builds a Facebook Graph API URL
function buildFacebookGraphUrl(endpointPath) {
  return `https://graph.facebook.com/${META_GRAPH_API_VERSION}${endpointPath}`;
}


// Builds an Instagram Graph API URL
function buildInstagramGraphUrl(endpointPath) {
  return `https://graph.facebook.com/${META_GRAPH_API_VERSION}${endpointPath}`;
}


// -----------------------------------------------------------------------------
// Facebook Graph API requests
// -----------------------------------------------------------------------------

// Sends a POST request to the Facebook Graph API
async function sendFacebookGraphRequest(
  endpointPath,
  requestBody
) {
  const requestUrl =
    buildFacebookGraphUrl(endpointPath);

  const formData = new URLSearchParams();

  for (const [fieldName, fieldValue] of Object.entries(
    requestBody
  )) {
    if (
      fieldValue === undefined ||
      fieldValue === null
    ) {
      continue;
    }

    if (typeof fieldValue === "object") {
      formData.append(
        fieldName,
        JSON.stringify(fieldValue)
      );
    } else {
      formData.append(
        fieldName,
        String(fieldValue)
      );
    }
  }

  formData.append(
    "access_token",
    facebookPageAccessToken
  );

  const apiResponse = await fetch(requestUrl, {
    method: "POST",
    headers: {
      "Content-Type":
        "application/x-www-form-urlencoded"
    },
    body: formData
  });

  const responseData = await apiResponse.json();

  if (!apiResponse.ok || responseData.error) {
    throw new Error(
      JSON.stringify(responseData, null, 2)
    );
  }

  return responseData;
}


// -----------------------------------------------------------------------------
// Instagram Graph API requests
// -----------------------------------------------------------------------------

// Sends a POST request to the Instagram Graph API
async function sendInstagramGraphRequest(
  endpointPath,
  requestBody
) {
  const requestUrl =
    buildInstagramGraphUrl(endpointPath);

  const formData = new URLSearchParams();

  for (const [fieldName, fieldValue] of Object.entries(
    requestBody
  )) {
    if (
      fieldValue === undefined ||
      fieldValue === null
    ) {
      continue;
    }

    if (Array.isArray(fieldValue)) {
      formData.append(
        fieldName,
        fieldValue.join(",")
      );
    } else if (typeof fieldValue === "object") {
      formData.append(
        fieldName,
        JSON.stringify(fieldValue)
      );
    } else {
      formData.append(
        fieldName,
        String(fieldValue)
      );
    }
  }

  formData.append(
    "access_token",
    instagramAccessToken
  );

  const apiResponse = await fetch(requestUrl, {
    method: "POST",
    headers: {
      "Content-Type":
        "application/x-www-form-urlencoded"
    },
    body: formData
  });

  const responseData = await apiResponse.json();

  if (!apiResponse.ok || responseData.error) {
    throw new Error(
      JSON.stringify(responseData, null, 2)
    );
  }

  return responseData;
}


// Sends a GET request to the Instagram Graph API
async function fetchInstagramGraphResource(
  endpointPath,
  queryParameters = {}
) {
  const requestUrl = new URL(
    buildInstagramGraphUrl(endpointPath)
  );

  for (const [fieldName, fieldValue] of Object.entries(
    queryParameters
  )) {
    if (
      fieldValue !== undefined &&
      fieldValue !== null
    ) {
      requestUrl.searchParams.append(
        fieldName,
        String(fieldValue)
      );
    }
  }

  requestUrl.searchParams.append(
    "access_token",
    instagramAccessToken
  );

  const apiResponse = await fetch(requestUrl);

  const responseData = await apiResponse.json();

  if (!apiResponse.ok || responseData.error) {
    throw new Error(
      JSON.stringify(responseData, null, 2)
    );
  }

  return responseData;
}


// -----------------------------------------------------------------------------
// Instagram processing helpers
// -----------------------------------------------------------------------------

// Waits for a specified number of milliseconds
function sleep(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}


// Waits until Instagram finishes processing a media container
async function waitForInstagramProcessing(
  containerId
) {
  const maximumAttempts = 60;
  const pollingIntervalMilliseconds = 3000;

  for (
    let attemptNumber = 1;
    attemptNumber <= maximumAttempts;
    attemptNumber++
  ) {
    const containerStatus =
      await fetchInstagramGraphResource(
        `/${containerId}`,
        {
          fields: "status_code,status"
        }
      );

    if (
      containerStatus.status_code === "FINISHED"
    ) {
      return containerStatus;
    }

    if (
      containerStatus.status_code === "ERROR" ||
      containerStatus.status_code === "EXPIRED"
    ) {
      throw new Error(
        JSON.stringify(
          containerStatus,
          null,
          2
        )
      );
    }

    await sleep(
      pollingIntervalMilliseconds
    );
  }

  throw new Error(
    `Instagram media container ${containerId} did not finish processing in time.`
  );
}


// Creates an Instagram media container without waiting for processing
async function createInstagramContainer({
  media,
  caption,
  isCarouselItem
}) {
  const containerRequestBody = {
    is_carousel_item: isCarouselItem
      ? "true"
      : undefined
  };

  if (
    !isCarouselItem &&
    isNonEmptyString(caption)
  ) {
    containerRequestBody.caption = caption;
  }

  if (media.type === "image") {
    containerRequestBody.media_type = "IMAGE";
    containerRequestBody.image_url = media.url;
  } else if (media.type === "video") {
    containerRequestBody.media_type =
      isCarouselItem
        ? "VIDEO"
        : "REELS";

    containerRequestBody.video_url = media.url;
  } else {
    throw new Error(
      `Unsupported Instagram media type: ${media.type}`
    );
  }

  return sendInstagramGraphRequest(
    `/${instagramAccountId}/media`,
    containerRequestBody
  );
}


// Creates a container and waits until Instagram finishes processing it
async function createAndProcessInstagramContainer({
  media,
  caption,
  isCarouselItem
}) {
  const createdContainer =
    await createInstagramContainer({
      media,
      caption,
      isCarouselItem
    });

  await waitForInstagramProcessing(
    createdContainer.id
  );

  return createdContainer;
}


// Publishes a completed Instagram media container
async function publishInstagramMedia(
  containerId
) {
  return sendInstagramGraphRequest(
    `/${instagramAccountId}/media_publish`,
    {
      creation_id: containerId
    }
  );
}


// -----------------------------------------------------------------------------
// Shared media schema
// -----------------------------------------------------------------------------

const socialMediaItemSchema = z.object({
  type: z
    .enum(["image", "video"])
    .describe(
      "The type of media. Must be either image or video."
    ),

  url: z
    .string()
    .url()
    .describe(
      "A public URL for the image or video to post."
    )
});


// -----------------------------------------------------------------------------
// Facebook publishing logic
// -----------------------------------------------------------------------------

// Publishes a single Facebook post
async function publishSingleFacebookPost({
  caption,
  media
}) {
  try {
    const configurationCheck =
      checkFacebookConfiguration();

    if (!configurationCheck.success) {
      return createFailureResponse(
        configurationCheck.message,
        configurationCheck
      );
    }

    const containsCaption =
      isNonEmptyString(caption);

    const containsMedia = Boolean(
      media &&
      isNonEmptyString(media.url)
    );

    if (!containsCaption && !containsMedia) {
      return createFailureResponse(
        "You must provide at least a caption or one image/video to post.",
        {
          success: false,
          error: "EMPTY_POST"
        }
      );
    }

    let facebookApiResult;
    let publishedPostType;

    if (!containsMedia) {
      publishedPostType = "text";

      facebookApiResult =
        await sendFacebookGraphRequest(
          `/${facebookPageId}/feed`,
          {
            message: caption
          }
        );
    } else if (media.type === "image") {
      publishedPostType = "image";

      facebookApiResult =
        await sendFacebookGraphRequest(
          `/${facebookPageId}/photos`,
          {
            url: media.url,
            caption: caption || ""
          }
        );
    } else if (media.type === "video") {
      publishedPostType = "video";

      facebookApiResult =
        await sendFacebookGraphRequest(
          `/${facebookPageId}/videos`,
          {
            file_url: media.url,
            description: caption || ""
          }
        );
    } else {
      return createFailureResponse(
        "Unsupported media type.",
        {
          success: false,
          error: "UNSUPPORTED_MEDIA_TYPE",
          media
        }
      );
    }

    return createSuccessResponse(
      `Facebook ${publishedPostType} post published successfully.`,
      {
        success: true,
        platform: "facebook",
        postType: publishedPostType,
        caption: caption || "",
        media: media || null,
        facebookApiResult
      }
    );
  } catch (error) {
    return createFailureResponse(
      "Facebook post failed.",
      {
        success: false,
        error: "FACEBOOK_POST_FAILED",
        details: error.message
      }
    );
  }
}


// Publishes one Facebook post containing multiple photos
async function publishFacebookPhotoAlbum({
  caption,
  mediaItems
}) {
  try {
    const configurationCheck =
      checkFacebookConfiguration();

    if (!configurationCheck.success) {
      return createFailureResponse(
        configurationCheck.message,
        configurationCheck
      );
    }

    if (
      !Array.isArray(mediaItems) ||
      mediaItems.length < 2
    ) {
      return createFailureResponse(
        "Facebook multiple-photo posting requires at least two images.",
        {
          success: false,
          error:
            "FACEBOOK_MULTIPLE_IMAGES_REQUIRED"
        }
      );
    }

    const hasUnsupportedMedia =
      mediaItems.some(
        (mediaItem) =>
          mediaItem.type !== "image"
      );

    if (hasUnsupportedMedia) {
      return createFailureResponse(
        "This Facebook multiple-media tool currently supports images only.",
        {
          success: false,
          error:
            "FACEBOOK_MULTI_PHOTO_IMAGES_ONLY"
        }
      );
    }

    const unpublishedPhotos = [];

    for (
      let mediaIndex = 0;
      mediaIndex < mediaItems.length;
      mediaIndex++
    ) {
      const mediaItem =
        mediaItems[mediaIndex];

      const photoUploadResult =
        await sendFacebookGraphRequest(
          `/${facebookPageId}/photos`,
          {
            url: mediaItem.url,
            published: false
          }
        );

      unpublishedPhotos.push({
        index: mediaIndex,
        type: mediaItem.type,
        url: mediaItem.url,
        photoId: photoUploadResult.id,
        photoUploadResult
      });
    }

    const feedRequestBody = {
      message: caption || ""
    };

    for (
      let photoIndex = 0;
      photoIndex < unpublishedPhotos.length;
      photoIndex++
    ) {
      feedRequestBody[
        `attached_media[${photoIndex}]`
      ] = {
        media_fbid:
          unpublishedPhotos[photoIndex]
            .photoId
      };
    }

    const facebookApiResult =
      await sendFacebookGraphRequest(
        `/${facebookPageId}/feed`,
        feedRequestBody
      );

    return createSuccessResponse(
      `Facebook post with ${mediaItems.length} photos published successfully.`,
      {
        success: true,
        platform: "facebook",
        postType: "multiple_photos",
        caption: caption || "",
        totalMediaItems:
          mediaItems.length,
        unpublishedPhotos,
        facebookApiResult
      }
    );
  } catch (error) {
    return createFailureResponse(
      "Facebook multiple-photo post failed.",
      {
        success: false,
        error:
          "FACEBOOK_MULTIPLE_PHOTO_POST_FAILED",
        details: error.message
      }
    );
  }
}


// -----------------------------------------------------------------------------
// Instagram publishing logic
// -----------------------------------------------------------------------------

// Publishes a single Instagram image or Reel
async function publishSingleInstagramPost({
  caption,
  media
}) {
  try {
    const configurationCheck =
      checkInstagramConfiguration();

    if (!configurationCheck.success) {
      return createFailureResponse(
        configurationCheck.message,
        configurationCheck
      );
    }

    if (
      !media ||
      !isNonEmptyString(media.url)
    ) {
      return createFailureResponse(
        "Instagram posts must include one image or video URL.",
        {
          success: false,
          error:
            "INSTAGRAM_MEDIA_REQUIRED"
        }
      );
    }

    const createdContainer =
      await createAndProcessInstagramContainer({
        media,
        caption,
        isCarouselItem: false
      });

    const instagramApiResult =
      await publishInstagramMedia(
        createdContainer.id
      );

    const publishedPostType =
      media.type === "video"
        ? "reel"
        : "image";

    return createSuccessResponse(
      `Instagram ${publishedPostType} post published successfully.`,
      {
        success: true,
        platform: "instagram",
        postType: publishedPostType,
        caption: caption || "",
        media,
        createdContainer,
        instagramApiResult
      }
    );
  } catch (error) {
    return createFailureResponse(
      "Instagram post failed.",
      {
        success: false,
        error: "INSTAGRAM_POST_FAILED",
        details: error.message
      }
    );
  }
}


// Publishes an Instagram carousel
async function publishInstagramCarousel({
  caption,
  mediaItems
}) {
  try {
    const configurationCheck =
      checkInstagramConfiguration();

    if (!configurationCheck.success) {
      return createFailureResponse(
        configurationCheck.message,
        configurationCheck
      );
    }

    if (
      !Array.isArray(mediaItems) ||
      mediaItems.length < 2
    ) {
      return createFailureResponse(
        "Instagram carousel posting requires at least two media items.",
        {
          success: false,
          error:
            "INSTAGRAM_CAROUSEL_REQUIRES_MULTIPLE_ITEMS"
        }
      );
    }

    // Creates all child media containers concurrently
    const createdChildContainers =
      await Promise.all(
        mediaItems.map((mediaItem) =>
          createInstagramContainer({
            media: mediaItem,
            caption: "",
            isCarouselItem: true
          })
        )
      );

    // Waits for all child containers to finish processing concurrently
    await Promise.all(
      createdChildContainers.map(
        (createdContainer) =>
          waitForInstagramProcessing(
            createdContainer.id
          )
      )
    );

    const carouselItems =
      mediaItems.map(
        (mediaItem, mediaIndex) => ({
          index: mediaIndex,
          type: mediaItem.type,
          url: mediaItem.url,
          containerId:
            createdChildContainers[
              mediaIndex
            ].id,
          container:
            createdChildContainers[
              mediaIndex
            ]
        })
      );

    const carouselParentContainer =
      await sendInstagramGraphRequest(
        `/${instagramAccountId}/media`,
        {
          media_type: "CAROUSEL",

          children: carouselItems.map(
            (carouselItem) =>
              carouselItem.containerId
          ),

          caption: caption || ""
        }
      );

    await waitForInstagramProcessing(
      carouselParentContainer.id
    );

    const instagramApiResult =
      await publishInstagramMedia(
        carouselParentContainer.id
      );

    return createSuccessResponse(
      `Instagram carousel with ${mediaItems.length} media item(s) published successfully.`,
      {
        success: true,
        platform: "instagram",
        postType: "carousel",
        caption: caption || "",
        totalMediaItems:
          mediaItems.length,
        carouselItems,
        carouselParentContainer,
        instagramApiResult
      }
    );
  } catch (error) {
    return createFailureResponse(
      "Instagram carousel post failed.",
      {
        success: false,
        error:
          "INSTAGRAM_CAROUSEL_POST_FAILED",
        details: error.message
      }
    );
  }
}


// -----------------------------------------------------------------------------
// MCP server factory
// -----------------------------------------------------------------------------

function createMcpServer() {
  const server = new McpServer({
    name:
      "facebook-instagram-social-posting-mcp-server",
    version: "1.0.0"
  });


  server.registerTool(
    "facebookPostSingleMedia",
    {
      description:
        "Publish one Facebook Page post with either text, one image, or one video. Use this when the user wants to post a single media item to Facebook.",

      inputSchema: z.object({
        caption: z
          .string()
          .optional()
          .describe(
            "Optional caption or message for the Facebook post."
          ),

        media: socialMediaItemSchema
          .optional()
          .describe(
            "The single image or video to publish."
          )
      })
    },

    async (toolArguments) => {
      return publishSingleFacebookPost(
        toolArguments
      );
    }
  );


  server.registerTool(
    "facebookPostMultipleMedia",
    {
      description:
        "Publish multiple images in one Facebook Page post. Use this when the user wants to publish more than one image.",

      inputSchema: z.object({
        caption: z
          .string()
          .optional()
          .describe(
            "Optional caption or message for the Facebook post."
          ),

        mediaItems: z
          .array(socialMediaItemSchema)
          .min(2)
          .describe(
            "A list containing at least two images to publish."
          )
      })
    },

    async (toolArguments) => {
      return publishFacebookPhotoAlbum(
        toolArguments
      );
    }
  );


  server.registerTool(
    "instagramPostSingleMedia",
    {
      description:
        "Publish one Instagram post with either one image or one video/Reel. Use this when the user wants to post a single media item to Instagram.",

      inputSchema: z.object({
        caption: z
          .string()
          .optional()
          .describe(
            "Optional caption for the Instagram post. If there is no value given, the caption is an empty string"
          ),

        media: socialMediaItemSchema.describe(
          "The single image or video to publish."
        )
      })
    },

    async (toolArguments) => {
      return publishSingleInstagramPost(
        toolArguments
      );
    }
  );


  server.registerTool(
    "instagramPostMultipleMedia",
    {
      description:
        "Publish multiple images and/or videos as one Instagram carousel post. Use this when the user wants to post more than one media item to Instagram.",

      inputSchema: z.object({
        caption: z
          .string()
          .optional()
          .describe(
            "Optional caption for the Instagram carousel. If there is no value given, the caption is an empty string"
          ),

        mediaItems: z
          .array(socialMediaItemSchema)
          .min(2)
          .describe(
            "A list of image or video media items to publish as a carousel."
          )
      })
    },

    async (toolArguments) => {
      return publishInstagramCarousel(
        toolArguments
      );
    }
  );


  return server;
}


// -----------------------------------------------------------------------------
// MCP HTTP request handler
// -----------------------------------------------------------------------------

export async function handleMcpRequest(
  request,
  response
) {
  const server = createMcpServer();

  const requestTransport =
    new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined
    });

  try {
    await server.connect(
      requestTransport
    );

    await requestTransport.handleRequest(
      request,
      response,
      request.body
    );
  } catch (error) {
    console.error(
      "MCP request failed:",
      error
    );

    if (!response.headersSent) {
      response.status(500).json({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message:
            "Internal MCP server error"
        },
        id: request.body?.id ?? null
      });
    }
  }
}
