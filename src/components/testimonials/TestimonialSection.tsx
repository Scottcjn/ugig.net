"use client";

import { useEffect, useState } from "react";
import { TestimonialCard } from "./TestimonialCard";
import { TestimonialForm } from "./TestimonialForm";
import { Star } from "lucide-react";

interface Testimonial {
  id: string;
  rating: number;
  content: string;
  created_at: string;
  author: {
    username: string;
    full_name: string | null;
    avatar_url: string | null;
  };
}

interface TestimonialSectionProps {
  profileId: string;
  currentUserId: string | null;
  isOwnProfile: boolean;
  initialTestimonials: Testimonial[];
  hasExisting: boolean;
}

export function TestimonialSection({
  profileId,
  currentUserId,
  isOwnProfile,
  initialTestimonials,
  hasExisting,
}: TestimonialSectionProps) {
  const [testimonials, setTestimonials] = useState(initialTestimonials);
  const [submitted, setSubmitted] = useState(hasExisting);

  const handleSuccess = () => {
    setSubmitted(true);
    // Testimonial is pending so won't show in approved list yet
  };

  return (
    <div className="p-6 bg-card rounded-lg border border-border">
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <Star className="h-5 w-5 text-yellow-400" />
        Testimonials
        {testimonials.length > 0 && (
          <span className="text-sm font-normal text-muted-foreground">
            ({testimonials.length})
          </span>
        )}
      </h2>

      {testimonials.length > 0 ? (
        <div className="space-y-4">
          {testimonials.map((t) => (
            <TestimonialCard
              key={t.id}
              id={t.id}
              rating={t.rating}
              content={t.content}
              createdAt={t.created_at}
              author={t.author}
            />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          No testimonials yet.{" "}
          {!isOwnProfile && currentUserId && !submitted && "Be the first to leave one!"}
        </p>
      )}

      {/* Show form for logged-in non-owners who haven't already submitted */}
      {currentUserId && !isOwnProfile && !submitted && (
        <div className="mt-6">
          <TestimonialForm profileId={profileId} onSuccess={handleSuccess} />
        </div>
      )}

      {currentUserId && !isOwnProfile && submitted && (
        <div className="mt-4 p-3 bg-muted/50 rounded-lg text-sm text-muted-foreground">
          You&apos;ve already left a testimonial for this profile.
        </div>
      )}
    </div>
  );
}
