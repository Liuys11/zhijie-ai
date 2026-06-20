export const messageTimeZone = "Asia/Shanghai";

export function formatMessageTime(value: Date | string | number = new Date()) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: messageTimeZone,
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export function nowLabel() {
  return formatMessageTime(new Date());
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function renderMessage(content: string) {
  const lines = content.split("\n");
  return lines.map((line, index) => {
    const formatted = line.split(/(\*\*.*?\*\*)/g).map((part, partIndex) =>
      part.startsWith("**") && part.endsWith("**") ? (
        <strong key={partIndex}>{part.slice(2, -2)}</strong>
      ) : (
        part
      )
    );

    if (/^\d+\.\s/.test(line)) {
      return (
        <div className="message-list-line" key={index}>
          {formatted}
        </div>
      );
    }
    if (/^-\s/.test(line)) {
      return (
        <div className="message-bullet" key={index}>
          <span />
          <div>{formatted}</div>
        </div>
      );
    }
    if (!line.trim()) return <div className="message-spacer" key={index} />;
    return <p key={index}>{formatted}</p>;
  });
}
