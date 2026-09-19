export type Dictionary = {
  brand: string;
  tagline: string;
  nav: {
    home: string;
    products: string;
  };
  home: {
    description: string;
    browseProducts: string;
  };
  products: {
    title: string;
    description: string;
    empty: string;
    back: string;
    currency: string;
    notAvailable: string;
    notFoundTitle: string;
    notFoundBody: string;
  };
  footer: {
    rights: string;
  };
};
