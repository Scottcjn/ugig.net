"use client";

import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Check, CheckCheck, Bot, FileIcon, Download } from "lucide-react";
import type { MessageWithSender, Attachment } from "@/types";
import { cn } from "@/lib/utils";
import { linkifyText } from "@/lib/linkify";

interface MessageBubbleProps {
  message: MessageWithSender;
  isOwn: boolean;
  showAvatar?: boolean;
  otherParticipantId?: string;
}

function isImageAttachment(attachment: Attachment): boolean {
  return /^image\/(jpeg|jpg|png|gif|webp|svg\+xml)$/i.test(attachment.type);
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function AttachmentDisplay({ attachment }: { attachment: Attachment }) {
  if (isImageAttachment(attachment)) {
    return (
      <a
        href={attachment.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block mt-1"
      >
        <img
          src={attachment.url}
          alt={attachment.filename}
          className="max-w-full max-h-[400px] rounded-md object-cover cursor-pointer hover:opacity-90 transition-opacity"
        />
      </a>
    );
  }

  return (
    <a
      href={attachment.url}
      target="_blank"
      rel="noopener noreferrer"
      download={attachment.filename}
      className="flex items-center gap-2 mt-1 px-3 py-2 rounded-md bg-background/50 hover:bg-background/80 transition-colors text-xs"
    >
      <FileIcon className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
      <span className="truncate min-w-0">{attachment.filename}</span>
      <span className="text-muted-foreground flex-shrink-0">
        {formatFileSize(attachment.size)}
      </span>
      <Download className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
    </a>
  );
}

export function MessageBubble({
  message,
  isOwn,
  showAvatar = true,
  otherParticipantId,
}: MessageBubbleProps) {
  const linkifyClass = isOwn ? "text-white underline" : "text-blue-400 underline";

  const sender = message.sender;
  const isAgent = sender.account_type === "agent";
  const initials = (sender.full_name || sender.username || "U")
    .charAt(0)
    .toUpperCase();

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const isRead =
    isOwn &&
    otherParticipantId &&
    message.read_by?.includes(otherParticipantId);

  const attachments = (message.attachments as Attachment[] | null) || [];

  return (
    <div
      className={cn(
        "flex gap-2 max-w-[80%] min-w-0",
        isOwn ? "ml-auto flex-row-reverse" : ""
      )}
    >
      {showAvatar && (
        !isOwn ? (
          <a
            href={`/u/${sender.username}`}
            target="_blank"
            onClick={(e) => e.stopPropagation()}
            className="relative flex-shrink-0"
          >
            <Avatar className="h-8 w-8">
              {sender.avatar_url ? (
                <AvatarImage
                  src={sender.avatar_url}
                  alt={sender.full_name || sender.username}
                />
              ) : (
                <AvatarFallback className="text-xs">{initials}</AvatarFallback>
              )}
            </Avatar>
            {isAgent && (
              <span className="absolute -bottom-0.5 -right-0.5 bg-purple-500 text-white rounded-full p-0.5" title="AI Agent">
                <Bot className="h-2.5 w-2.5" />
              </span>
            )}
          </a>
        ) : (
          <div className="relative flex-shrink-0">
            <Avatar className="h-8 w-8">
              {sender.avatar_url ? (
                <AvatarImage
                  src={sender.avatar_url}
                  alt={sender.full_name || sender.username}
                />
              ) : (
                <AvatarFallback className="text-xs">{initials}</AvatarFallback>
              )}
            </Avatar>
            {isAgent && (
              <span className="absolute -bottom-0.5 -right-0.5 bg-purple-500 text-white rounded-full p-0.5" title="AI Agent">
                <Bot className="h-2.5 w-2.5" />
              </span>
            )}
          </div>
        )
      )}
      {!showAvatar && <div className="w-8 flex-shrink-0" />}

      <div className={cn("flex flex-col min-w-0", isOwn ? "items-end" : "items-start")}>
        <div
          className={cn(
            "rounded-lg px-3 py-2 text-sm max-w-full overflow-hidden",
            isOwn
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-foreground"
          )}
        >
          {message.content && (
            <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
              {linkifyText(message.content, linkifyClass)}
            </p>
          )}
          {attachments.length > 0 && (
            <div className="flex flex-col gap-1" data-testid="attachments">
              {attachments.map((attachment, index) => (
                <AttachmentDisplay key={index} attachment={attachment} />
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 mt-1">
          <span className="text-xs text-muted-foreground">
            {formatTime(message.created_at)}
          </span>
          {isOwn && (
            <span className="text-muted-foreground" title={isRead ? "Read" : "Sent"}>
              {isRead ? (
                <CheckCheck className="h-3 w-3 text-primary" />
              ) : (
                <Check className="h-3 w-3" />
              )}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
