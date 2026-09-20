export type Dictionary = {
  brand: string;
  tagline: string;
  announcement: string;
  nav: {
    home: string;
    products: string;
    menu: string;
    cart: string;
    search: string;
  };
  home: {
    hero: {
      title: string;
      highlight: string;
      rest: string;
      description: string;
    };
    cta: {
      shopNow: string;
      browse: string;
    };
    trust: {
      cod: string;
      fast: string;
      returns: string;
      whatsapp: string;
    };
    categories: {
      label: string;
      items: string[];
    };
    latest: {
      label: string;
      subtitle: string;
      viewAll: string;
    };
    why: {
      label: string;
      subtitle: string;
      items: {
        title: string;
        desc: string;
      }[];
    };
    banner: {
      title: string;
      desc: string;
    };
  };
  products: {
    title: string;
    description: string;
    empty: string;
    emptyTitle: string;
    emptyHint: string;
    back: string;
    currency: string;
    notAvailable: string;
    notFoundTitle: string;
    notFoundBody: string;
    gallery: string;
    variants: string;
    available: string;
    newBadge: string;
    addToCart: string;
    orderNow: string;
    related: string;
    delivery: {
      title: string;
      cash: string;
      shipping: string;
      returns: string;
    };
  };
  footer: {
    blurb: string;
    quick: string;
    contact: string;
    whatsapp: string;
    follow: string;
    rights: string;
  };
};