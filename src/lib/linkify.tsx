import React from 'react';

const URL_REGEX = /(https?:\/\/[^\s<>)"']+)/g;

/**
 * Convert URLs in text to clickable links.
 * Returns an array of React nodes (strings and <a> elements).
 */
export function linkifyText(text: string, className: string = "text-blue-400 underline"): React.ReactNode[] {
  const parts = text.split(URL_REGEX);
  return parts.map((part, i) =>
    URL_REGEX.test(part) ? (
      <a key={i} href={part} target="_blank" rel="noopener noreferrer" className={className} onClick={(e) => e.stopPropagation()}>
        {part}
      </a>
    ) : (
      part
    )
  );
}
