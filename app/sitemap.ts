import { blogs } from '@/data/blogs';
import { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {

  const blogUrls = blogs.map((blog) => ({
    url: `https://restrokhata.com/blogs/${blog.slug}`,
    lastModified: new Date(blog.date),
  }));

  return [
    {
      url: "https://restrokhata.com",
      lastModified: new Date(),
    },
    ...blogUrls,
    {
      url: 'https://restrokhata.com',
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1,
    },
    
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

    {
      url: "https://restrokhata.com/blogs/qr-menu-system-restaurants-india",
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.6,
    },
  ]
}

