import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { UpdateProductDto } from './dto/update-product.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { validate as isUUID } from 'uuid';
import { ProductWithImages } from './interfaces/product';

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(private prisma: PrismaService) {}

  async create(createProductDto: CreateProductDto) {
    // TODO: maybe transaction here, idk
    try {
      this.isExistsSlug();

      const { images = [], ...productDetails } = createProductDto;

      // Insertar nuevo producto
      // Insert new product
      const product = await this.prisma.products.create({
        data: { ...productDetails },
      });

      // Insertar nuevas imagenes de un producto
      // Insert new product images
      await Promise.all(
        images.map(async (image) => {
          return await this.prisma.product_images.create({
            data: {
              url: image,
              product: {
                connect: { id: product.id },
              },
            },
          });
        }),
      );

      return { ...product, images, id: undefined };
    } catch (error) {
      this.handleDatabaseExceptions(error);
    }
  }

  async findAll(paginationDto: PaginationDto) {
    const { limit = 10, offset = 0 } = paginationDto;

    try {
      const products = await this.prisma.products.findMany({
        take: limit,
        skip: offset,
        include: {
          productImage: {
            select: { url: true },
          },
        },
      });

      return products.map((product) => ({
        ...product,
        images: product.productImage.map((img) => img.url),
        id: undefined,
        productImage: undefined,
      }));
    } catch (error) {}
  }

  async findOne(term: string) {
    let product: ProductWithImages;

    // Buscar un product por id
    // Find product by id
    if (isUUID(term)) {
      product = await this.prisma.products.findUnique({
        where: { id: term },
        include: {
          productImage: {
            select: {
              url: true,
            },
          },
        },
      });
    } else {
      // Buscar el primer producto que cumpla los términos
      // Find first product by search terms
      product = await this.prisma.products.findFirst({
        where: {
          OR: [{ title: term }, { slug: term }],
        },
      });
    }

    return {
      ...product,
      images: product.productImage.map((img) => img.url),
      id: undefined,
      productImage: undefined,
    };
  }

  async update(id: string, updateProductDto: UpdateProductDto) {
    const { images, ...toUpdate } = updateProductDto;
    let dbImages: string[];

    try {
      this.isExistsSlug();

      let product: ProductWithImages;

      await this.prisma.$transaction(async (tx) => {
        try {
          if (images) {
            // Eliminar imagenes existentes
            await tx.product_images.deleteMany({ where: { productId: id } });
            // Insertar nuevas imagenes
            await Promise.all(
              images.map(async (image) => {
                await tx.product_images.create({
                  data: { url: image, productId: id },
                });
              }),
            );
          } else {
            // Obtener imagenes existentes
            dbImages = (
              await this.prisma.product_images.findMany({
                where: { productId: id },
                select: { url: true },
              })
            ).map((imagen) => imagen.url);
          }

          // Actualizar el producto
          product = await this.prisma.products.update({
            data: toUpdate,
            where: { id },
          });
        } catch (error) {
          console.log(error, 'Error en la transacción!!');
        }
      });

      if (!product)
        throw new HttpException(
          `Product with id: ${id} not found`,
          HttpStatus.NOT_FOUND,
        );

      return { ...product, id: undefined, images: images ? images : dbImages };
    } catch (error) {
      this.handleDatabaseExceptions(error);
    }
  }

  async remove(id: string) {
    return await this.prisma.products.delete({
      where: {
        id,
      },
    });
  }

  async deleteAllProducts() {
    try {
      await this.prisma.products.deleteMany();
    } catch (error) {
      this.handleDatabaseExceptions(error);
    }
  }

  private handleDatabaseExceptions(error: any) {
    if (error.code === 'P2002') {
      throw new HttpException(
        `Unique constraint failed on the fields: ${error.meta.target}`,
        HttpStatus.BAD_REQUEST,
      );
    }

    this.logger.error(error);
    throw new HttpException(
      'Unexpected error, check server logs',
      HttpStatus.BAD_REQUEST,
    );
  }

  private isExistsSlug() {
    this.prisma.$use(async (params, next) => {
      if (params.model === 'products' && params.action === 'create') {
        // Si no existe slug, lo reconstruimos mediante el título
        if (!params.args.data.slug) {
          params.args.data.slug = params.args.data.title
            .toLowerCase()
            .replaceAll(' ', '_')
            .replaceAll("'", '');
        } else {
          // Si existe el slug, lo parseamos a un slug válido
          params.args.data.slug = params.args.data.slug
            .toLowerCase()
            .replaceAll(' ', '_')
            .replaceAll("'", '');
        }
      }
      const result = await next(params);
      return result;
    });
  }
}
