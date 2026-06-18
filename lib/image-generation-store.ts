import { getStoragePublicUrl, supabaseRest, uploadStorageObject } from "@/lib/supabase-rest";
import type { GeneratedImage } from "@/lib/image-provider";

export type DbProject = {
  id: string;
};

export type DbConversation = {
  id: string;
  project_id: string;
};

export type DbMessage = {
  id: string;
};

export type ImagePartStatus = "generating" | "completed" | "failed";

export const GENERATED_IMAGES_BUCKET = "generated-images";

export function getExtension(mimeType: string) {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  return "png";
}

export function buildUserContent(prompt: string) {
  return `生成一张教学插图：${prompt}`;
}

export function buildImageParts({
  prompt,
  status,
  url,
  storagePath,
  error,
  taskId,
  taskStatus,
  provider
}: {
  prompt: string;
  status: ImagePartStatus;
  url?: string;
  storagePath?: string;
  error?: string;
  taskId?: string;
  taskStatus?: string;
  provider?: string;
}) {
  const content = status === "completed"
    ? `已根据你的描述生成教学图片：**${prompt}**`
    : status === "generating"
      ? `正在根据你的描述生成教学图片：**${prompt}**`
      : `图片生成没有完成：**${prompt}**`;

  return [
    {
      type: "markdown",
      content
    },
    {
      type: "image",
      prompt,
      url,
      storagePath,
      status,
      error,
      taskId,
      taskStatus,
      provider
    }
  ];
}

export async function ensureProjectAccess(token: string, projectId: string) {
  const projects = await supabaseRest<DbProject[]>(token, `projects?select=id&id=eq.${projectId}&limit=1`);
  return projects[0] || null;
}

export async function ensureConversation(token: string, userId: string, projectId: string, conversationId?: string) {
  if (conversationId) {
    const existing = await supabaseRest<DbConversation[]>(
      token,
      `conversations?select=id,project_id&id=eq.${conversationId}&project_id=eq.${projectId}&limit=1`
    );
    if (existing[0]) return existing[0];
  }

  const existing = await supabaseRest<DbConversation[]>(
    token,
    `conversations?select=id,project_id&project_id=eq.${projectId}&user_id=eq.${userId}&order=created_at.asc&limit=1`
  );
  if (existing[0]) return existing[0];

  const created = await supabaseRest<DbConversation[]>(token, "conversations", {
    method: "POST",
    prefer: "return=representation",
    body: {
      project_id: projectId,
      user_id: userId,
      title: "默认对话",
      mode: "图片生成"
    }
  });

  return created[0];
}

export async function saveMessage(
  token: string,
  userId: string,
  conversationId: string,
  role: "user" | "assistant",
  content: string,
  metadata: Record<string, unknown> = {},
  model?: string
) {
  const created = await supabaseRest<DbMessage[]>(token, "messages", {
    method: "POST",
    prefer: "return=representation",
    body: {
      conversation_id: conversationId,
      user_id: userId,
      role,
      content,
      model,
      metadata
    }
  });

  return created[0];
}

export async function updateMessage(
  token: string,
  messageId: string,
  content: string,
  metadata: Record<string, unknown>,
  model?: string
) {
  const updated = await supabaseRest<DbMessage[]>(token, `messages?id=eq.${messageId}`, {
    method: "PATCH",
    prefer: "return=representation",
    body: {
      content,
      model,
      metadata
    }
  });

  return updated[0];
}

export async function saveGeneratedAsset(
  token: string,
  userId: string,
  projectId: string,
  messageId: string,
  prompt: string,
  storagePath: string,
  publicUrl: string,
  mimeType: string,
  provider: string,
  model: string
) {
  await supabaseRest<unknown[]>(token, "generated_assets", {
    method: "POST",
    body: {
      project_id: projectId,
      user_id: userId,
      message_id: messageId,
      asset_type: "image",
      prompt,
      storage_bucket: GENERATED_IMAGES_BUCKET,
      storage_path: storagePath,
      public_url: publicUrl,
      mime_type: mimeType,
      provider,
      model,
      status: "completed",
      metadata: {}
    }
  });
}

export async function storeGeneratedImage(
  token: string,
  userId: string,
  projectId: string,
  image: GeneratedImage
) {
  const extension = getExtension(image.mimeType);
  const storagePath = `${userId}/${projectId}/image-${Date.now()}.${extension}`;
  await uploadStorageObject(token, GENERATED_IMAGES_BUCKET, storagePath, image.bytes, image.mimeType);

  return {
    storagePath,
    publicUrl: `${getStoragePublicUrl(GENERATED_IMAGES_BUCKET, storagePath)}?v=${Date.now()}`
  };
}
