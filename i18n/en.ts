import type { Dictionary } from "./dictionary";

export const en: Dictionary = {
  brand: "TradeMart",
  tagline: "Your Online Store",
  announcement: "Cash on Delivery | Fast shipping to all cities",
  nav: {
    home: "Home",
    products: "Products",
    menu: "Menu",
    cart: "Cart",
    search: "Search the store",
  },
  home: {
    hero: {
      title: "Everything you need.",
      highlight: "One place.",
      rest: "A huge, ever-growing selection of original products",
      description:
        "A wide range of authentic products at competitive prices straight from the source — pay cash on delivery and get it fast anywhere.",
    },
    cta: {
      shopNow: "Shop now",
      browse: "Browse products",
    },
    trust: {
      cod: "Cash on delivery",
      fast: "Fast shipping everywhere",
      returns: "Easy exchange & returns",
      whatsapp: "WhatsApp support all day",
    },
    categories: {
      label: "Shop by category",
      items: [
        "Electronics",
        "Phones",
        "Home & Kitchen",
        "Fashion",
        "Beauty",
        "Kids",
        "Sports",
        "Tools",
      ],
    },
    latest: {
      label: "Latest products",
      subtitle: "Fresh arrivals — carefully selected for you",
      viewAll: "View all",
    },
    why: {
      label: "Why shop with us?",
      subtitle: "A comfortable shopping experience built to earn your trust",
      items: [
        { title: "Best prices", desc: "Competitive prices straight from the source." },
        { title: "Genuine products", desc: "Hand-picked from trusted suppliers." },
        { title: "Buy in minutes", desc: "Fast pages, fully mobile-friendly — order anywhere." },
      ],
    },
    banner: {
      title: "Ready to shop?",
      desc: "Explore the newest arrivals and order easily — cash on delivery.",
    },
  },
  products: {
    title: "Products",
    description: "Browse all the products available in the store.",
    empty: "No products are currently available.",
    emptyTitle: "No products to show yet",
    emptyHint: "We refresh our selection regularly — follow us on WhatsApp to get new drops first.",
    back: "Back to products",
    currency: "EGP",
    notAvailable: "Currently unavailable",
    notFoundTitle: "Product not found",
    notFoundBody: "Sorry, we couldn't find this product.",
    gallery: "Image gallery",
    variants: "Available options",
    available: "In stock",
    newBadge: "New",
    addToCart: "Add to cart",
    orderNow: "Order now",
    related: "You may also like",
    delivery: {
      title: "Delivery info",
      cash: "Cash on delivery",
      shipping: "Fast shipping within 24–48 hours",
      returns: "Exchange & returns within 14 days",
    },
  },
  footer: {
    blurb:
      "TradeMart — your trusted online store. A wide product range, competitive prices, and cash on delivery everywhere.",
    quick: "Quick links",
    contact: "Contact us",
    whatsapp: "Order via WhatsApp",
    follow: "Follow us",
    rights: "All rights reserved",
  },
};