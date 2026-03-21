"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Smile } from "lucide-react";

const EMOJI_CATEGORIES = {
  "😀 Smileys": ["😀","😂","🤣","😊","😍","🥰","😘","😜","🤔","😏","😎","🥳","😤","😭","😱","🤯","🥺","😴","🤮","💀"],
  "👍 Hands": ["👍","👎","👋","🤝","👏","🙌","💪","✌️","🤞","🤙","👊","✊","🫡","🫶","🙏","💅","🖐️","✋","👌","🤌"],
  "❤️ Hearts": ["❤️","🧡","💛","💚","💙","💜","🖤","🤍","💔","❤️‍🔥","💕","💖","💗","💝","💘","💯","💢","💥","✨","🔥"],
  "🎉 Objects": ["🎉","🎊","🎯","🏆","⭐","🌟","💡","💰","💸","🚀","⚡","🔑","🛠️","📌","📝","🎵","🎶","📸","💻","🤖"],
  "🍕 Food": ["🍕","🍔","🌮","🍣","🍜","🍩","🍪","🧁","🍺","🍷","☕","🧃","🥤","🍿","🥂","🎂","🍰","🥑","🌶️","🍗"],
  "🌍 Nature": ["🌍","🌈","☀️","🌙","⛈️","❄️","🌊","🏔️","🌺","🌸","🌲","🍀","🐕","🐈","🦊","🐸","🦋","🐝","🐙","🦑"],
};

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  disabled?: boolean;
}

export function EmojiPicker({ onSelect, disabled }: EmojiPickerProps) {
  const [open, setOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState(Object.keys(EMOJI_CATEGORIES)[0]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="flex-shrink-0"
        disabled={disabled}
        onClick={() => setOpen(!open)}
        aria-label="Emoji picker"
      >
        <Smile className="h-4 w-4" />
      </Button>

      {open && (
        <div className="absolute bottom-full mb-2 left-0 bg-popover border border-border rounded-lg shadow-lg z-50 w-[280px]">
          {/* Category tabs */}
          <div className="flex border-b border-border overflow-x-auto p-1 gap-0.5">
            {Object.keys(EMOJI_CATEGORIES).map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-2 py-1 text-sm rounded whitespace-nowrap transition-colors ${
                  activeCategory === cat
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {cat.split(" ")[0]}
              </button>
            ))}
          </div>

          {/* Emoji grid */}
          <div className="p-2 grid grid-cols-8 gap-0.5 max-h-[200px] overflow-y-auto">
            {EMOJI_CATEGORIES[activeCategory as keyof typeof EMOJI_CATEGORIES].map((emoji) => (
              <button
                key={emoji}
                onClick={() => {
                  onSelect(emoji);
                  setOpen(false);
                }}
                className="h-8 w-8 flex items-center justify-center text-lg hover:bg-muted rounded transition-colors"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
