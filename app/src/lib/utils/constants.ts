export const APP_NAME = 'etC2'
export const APP_DESCRIPTION = 'POD Analytics for Etsy Sellers'
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

export const PLATFORMS = {
  etsy: { name: 'Etsy', color: '#F1641E', icon: 'store' },
  shopify: { name: 'Shopify', color: '#96BF48', icon: 'shopping-bag' },
  printify: { name: 'Printify', color: '#39B54A', icon: 'printer' },
} as const

export type Platform = keyof typeof PLATFORMS

export const ORDER_STATUSES = ['pending', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'] as const
export const FULFILLMENT_STATUSES = ['unfulfilled', 'in_production', 'shipped', 'in_transit', 'delivered'] as const
