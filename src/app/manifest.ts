import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'DripDrop — Dispenser Duty',
    short_name: 'DripDrop',
    description:
      'Schedule water dispenser refills, confirm with photo proof, and see what is overdue.',
    start_url: '/',
    display: 'standalone',
    background_color: '#e9f6f9',
    theme_color: '#2f96b4',
    icons: [
      {
        src: '/mascot.png',
        sizes: '1024x1024',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  }
}
