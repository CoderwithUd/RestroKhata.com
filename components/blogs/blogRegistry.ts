import Blog1 from "@/components/blogs/blog1";
import Blog2 from "@/components/blogs/blog2";
import Blog3 from "@/components/blogs/blog3";
import type { Blog } from "@/data/blogs";
import type { ComponentType } from "react";

export type BlogPostProps = {
  blog: Blog;
  relatedBlogs: Blog[];
};

export const blogComponents: Record<string, ComponentType<BlogPostProps>> = {
  blog1: Blog1,
  blog2: Blog2,
  blog3: Blog3,
};
