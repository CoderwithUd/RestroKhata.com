import { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  return [
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
  ]
}
