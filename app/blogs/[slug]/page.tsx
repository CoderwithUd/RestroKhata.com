import { blogComponents } from "@/components/blogs/blogRegistry";
import { blogs } from "@/data/blogs";
import { notFound } from "next/navigation";

type BlogPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export function generateStaticParams() {
  return blogs.map((blog) => ({
    slug: blog.slug,
  }));
}

export default async function Page({ params }: BlogPageProps) {
  const { slug } = await params;
  const blog = blogs.find((b) => b.slug === slug);

  if (!blog) {
    notFound();
  }

  const BlogPost = blogComponents[blog.component];

  if (!BlogPost) {
    notFound();
  }

  return <BlogPost blog={blog} relatedBlogs={blogs.filter((item) => item.slug !== blog.slug)} />;
}

export async function generateMetadata({ params }: BlogPageProps) {
  const { slug } = await params;
  const blog = blogs.find((b) => b.slug === slug);

  if (!blog) {
    return {}
  }

  const canonicalUrl = `https://restrokhata.com/blogs/${blog.slug}`;
  
  return {
    title: blog.title,
    description: blog.description,
    keywords: blog.keywords,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title: blog.title,
      description: blog.description,
      type: "article",
      url: canonicalUrl,
      images: [blog.image],
    },
    twitter: {
      card: "summary_large_image",
      title: blog.title,
      description: blog.description,
      images: [blog.image],
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}
