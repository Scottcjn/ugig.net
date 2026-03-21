"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StarRating } from "./StarRating";

interface TestimonialFormProps {
  profileId?: string;
  gigId?: string;
  onSuccess?: () => void;
}

export function TestimonialForm({ profileId, gigId, onSuccess }: TestimonialFormProps) {
  const [rating, setRating] = useState(0);
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rating === 0) {
      setError("Please select a rating");
      return;
    }
    if (!content.trim()) {
      setError("Please write a testimonial");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const payload: Record<string, unknown> = { rating, content: content.trim() };
      if (gigId) {
        payload.gig_id = gigId;
      } else if (profileId) {
        payload.profile_id = profileId;
      }

      const res = await fetch("/api/testimonials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to submit testimonial");
      }

      setSuccess(true);
      setContent("");
      setRating(0);
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg text-sm text-green-600">
        Your testimonial has been submitted and is pending approval. Thank you!
      </div>
    );
  }

  const placeholder = gigId
    ? "Share your experience with this gig..."
    : "Share your experience working with this person...";

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-5 bg-card rounded-lg border border-border">
      <h3 className="font-semibold text-sm">Leave a Testimonial</h3>

      <div>
        <label className="text-sm text-muted-foreground mb-1.5 block">Rating</label>
        <StarRating rating={rating} size="lg" interactive onRatingChange={setRating} />
      </div>

      <div>
        <label className="text-sm text-muted-foreground mb-1.5 block">Your testimonial</label>
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={placeholder}
          rows={4}
          maxLength={1000}
        />
        <p className="text-xs text-muted-foreground mt-1">{content.length}/1000</p>
      </div>

      {error && (
        <p className="text-sm text-red-500">{error}</p>
      )}

      <Button type="submit" disabled={submitting || rating === 0 || !content.trim()}>
        {submitting ? "Submitting..." : "Submit Testimonial"}
      </Button>
    </form>
  );
}
