import { blogs } from '@/data/blogs';
import { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  const blogUrls: MetadataRoute.Sitemap = blogs.map((blog) => ({
    url: `https://restrokhata.com/blogs/${blog.slug}`,
    lastModified: new Date(blog.date),
  }));

  const entries: MetadataRoute.Sitemap = [
    {
      url: "https://restrokhata.com/",
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1,
    },
    ...blogUrls,
    {
      url: "https://restrokhata.com/privacy-policy",
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.6,
    },

    {
      url: "https://restrokhata.com/terms-and-condition",
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.6,
    },

    {
      url: "https://restrokhata.com/blogs",
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.6,
    },
  ];

  return entries.filter(
    (entry, index, allEntries) =>
      index === allEntries.findIndex((candidate) => candidate.url === entry.url)
  );
}

