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
  cart: {
    title: string;
    subtitle: string;
    emptyTitle: string;
    emptyHint: string;
    browse: string;
    loading: string;
    unavailable: string;
    decrease: string;
    increase: string;
    remove: string;
    subtotal: string;
    shipping: string;
    total: string;
  };
  checkout: {
    title: string;
    subtitle: string;
    name: string;
    namePlaceholder: string;
    phone: string;
    phonePlaceholder: string;
    country: string;
    countryPlaceholder: string;
    city: string;
    cityPlaceholder: string;
    governorate: string;
    governoratePlaceholder: string;
    address: string;
    addressPlaceholder: string;
    codNote: string;
    placeOrder: string;
    placing: string;
    invalidDetails: string;
    genericError: string;
  };
  order: {
    successTitle: string;
    successBody: string;
    orderNumber: string;
    paymentNote: string;
    continue: string;
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