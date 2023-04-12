export interface ProductWithImages {
  id: string;
  title: string;
  sizes: string[];
  gender: string;
  price: decimal;
  description: string | null;
  slug: string;
  stock: number;
  tags: string[];
  productImage?: { url: string }[];
}
