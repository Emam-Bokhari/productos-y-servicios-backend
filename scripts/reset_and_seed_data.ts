import mongoose from "mongoose";
import bcrypt from "bcrypt";
import config from "../src/config";
import { User } from "../src/app/modules/user/user.model";
import { Store } from "../src/app/modules/store/store.model";
import { Seller } from "../src/app/modules/seller/seller.model";
import { Product } from "../src/app/modules/product/product.model";
import { Service } from "../src/app/modules/service/service.model";
import { Subscription } from "../src/app/modules/subscription/subscription.model";
import { SubscriptionPackage } from "../src/app/modules/subscriptionPackage/subscriptionPackage.model";
import { Advertisement } from "../src/app/modules/advertisement/advertisement.model";
import { CityAdConfiguration } from "../src/app/modules/cityAdConfiguration/cityAdConfiguration.model";
import { StoreCategory } from "../src/app/modules/storeCategory/storeCategory.model";
import { Transaction } from "../src/app/modules/transaction/transaction.model";
import { Review } from "../src/app/modules/review/review.model";
import { Favorite } from "../src/app/modules/favorite/favorite.model";
import { StoreTraffic } from "../src/app/modules/storeTraffic/storeTraffic.model";
import { DAYS } from "../src/constants/days";
import {
  STORE_STATUS,
  STORE_TYPE,
  DOCUMENT_TYPE,
} from "../src/app/modules/store/store.constant";
import { PRODUCT_STATUS } from "../src/app/modules/product/product.constant";
import { SERVICE_STATUS } from "../src/app/modules/service/service.constant";
import {
  ADVERTISEMENT_STATUS,
  ADVERTISEMENT_TYPE,
} from "../src/app/modules/advertisement/advertisement.constant";
import {
  PAYMENT_METHOD,
  PAYMENT_STATUS,
  TRANSACTION_TYPE,
} from "../src/app/modules/transaction/transaction.constant";
import { FAVORITE_TYPE } from "../src/enums/favorite";

async function runResetAndSeed() {
  console.log("=================================================");
  console.log("🚀 STARTING DATABASE RESET & SEEDING SCRIPT");
  console.log("=================================================");

  await mongoose.connect(config.database_url as string);
  console.log("✔ Connected to MongoDB successfully.");

  const db = mongoose.connection.db!;
  const saltRounds = Number(config.bcrypt_salt_rounds) || 12;
  const commonPasswordHash = await bcrypt.hash("12345678", saltRounds);

  // 1. Collections to delete completely (everything except users, config packages, cities, categories, faqs, rules, banners)
  const collectionsToClear = [
    "subscriptions",
    "transactions",
    "advertisements",
    "stores",
    "sellers",
    "products",
    "services",
    "storetraffics",
    "reviews",
    "favorites",
    "chats",
    "messages",
    "notifications",
    "reports",
    "tokens",
    "broadcasts",
    "devicetokens",
    "comments",
    "usercredits",
    "coupons",
    "classstatuses",
    "bookingclasses",
    "clubmemberleaves",
    "posts",
    "supports",
    "closeclubrequests",
    "clubs",
    "clubnotificationsettings",
    "tickets",
    "usernotificationsettings",
    "notificationpreferences",
  ];

  console.log(
    "\n🗑️ Step 1: Deleting existing data from target collections (Keeping 'users')...",
  );
  for (const colName of collectionsToClear) {
    try {
      const colExists =
        (await db.listCollections({ name: colName }).toArray()).length > 0;
      if (colExists) {
        const result = await db.collection(colName).deleteMany({});
        console.log(
          `   - Deleted ${result.deletedCount} documents from '${colName}'`,
        );
      }
    } catch (err: any) {
      console.warn(`   - Warning clearing '${colName}':`, err.message);
    }
  }

  // 2. Reset user subscription and store fields for all users
  console.log(
    "\n🔄 Step 2: Resetting subscription & seller fields on 'users' collection...",
  );
  await db.collection("users").updateMany(
    {},
    {
      $set: {
        activeRole: "user",
        subscriptionStatus: "none",
        averageRating: 0,
        totalRatings: 0,
        totalReviews: 0,
      },
      $unset: {
        subscriptionPackageId: "",
        subscriptionExpiresAt: "",
        datafastRegistrationToken: "",
      },
    },
  );
  console.log("   ✔ User store & subscription fields reset.");

  // 3. Load active master data
  console.log("\n🔍 Step 3: Fetching active master configurations...");
  const activePackages = await SubscriptionPackage.find({});
  const storePackage =
    activePackages.find((p) => p.packageType === "store_creation") ||
    activePackages[0];
  const postAddPackage =
    activePackages.find((p) => p.packageType === "post_add") ||
    activePackages[1];

  console.log(
    `   - Store creation package: "${storePackage?.name}" ($${storePackage?.price})`,
  );
  console.log(
    `   - Post add package: "${postAddPackage?.name}" ($${postAddPackage?.price})`,
  );

  const activeCities = await CityAdConfiguration.find({ status: "active" });
  console.log(
    `   - Found ${activeCities.length} active city ad configurations.`,
  );

  const quitoCity =
    activeCities.find((c) => c.city.toLowerCase().includes("quito")) ||
    activeCities[0];
  const guayaquilCity =
    activeCities.find((c) => c.city.toLowerCase().includes("guayaquil")) ||
    activeCities[1] ||
    activeCities[0];
  const esmeraldasCity =
    activeCities.find((c) => c.city.toLowerCase().includes("esmeraldas")) ||
    activeCities[2] ||
    activeCities[0];
  const santaElenaCity =
    activeCities.find((c) => c.city.toLowerCase().includes("santa elena")) ||
    activeCities[3] ||
    activeCities[0];

  const prodCategories = await StoreCategory.find({
    type: "product",
    parentId: null,
  });
  const servCategories = await StoreCategory.find({
    type: "service",
    parentId: null,
  });

  console.log(
    `   - Found ${prodCategories.length} product categories & ${servCategories.length} service categories.`,
  );

  // 4. Select users to act as sellers / store owners
  const allUsers = await User.find({});
  console.log(`   - Found ${allUsers.length} total active users.`);

  // Prioritize well-known user accounts
  const candidateEmails = [
    "studentemam@gmail.com",
    "datafast.merchant.2026@gmail.com",
    "bokhari@gmail.com",
    "datafast@gmail.com",
    "service@gmail.com",
    "adrianrivego@hotmail.com",
    "juliogonzalezestupinan@gmail.com",
    "nagome1987@hotmail.com",
    "jamal@gmail.com",
    "miniva6596@bocably.com",
  ];

  const sellerUsers: any[] = [];
  for (const email of candidateEmails) {
    const u = allUsers.find((user) => user.email === email);
    if (u && !sellerUsers.some((s) => s._id.toString() === u._id.toString())) {
      sellerUsers.push(u);
    }
  }

  // If we need more users, pick other users
  for (const u of allUsers) {
    if (sellerUsers.length >= 10) break;
    if (
      u.role === "user" &&
      !sellerUsers.some((s) => s._id.toString() === u._id.toString())
    ) {
      sellerUsers.push(u);
    }
  }

  console.log(
    `\n👥 Step 4: Selected ${sellerUsers.length} users to become Store Owners & Sellers:`,
  );
  sellerUsers.forEach((u, i) =>
    console.log(`   ${i + 1}. ${u.name} (${u.email})`),
  );

  // Regular users who will write reviews and favorites
  const regularUsers = allUsers.filter(
    (u) => !sellerUsers.some((s) => s._id.toString() === u._id.toString()),
  );

  // 5. Create Stores, Sellers, Subscriptions, and Transactions
  console.log(
    "\n🏪 Step 5: Creating Stores, Sellers, Subscriptions, and Transactions...",
  );

  const storeConfigs = [
    // 5 Product Stores
    {
      type: STORE_TYPE.PRODUCT_STORE,
      name: "ElectroTech Ecuador Pro",
      desc: "Tu tienda líder en tecnología de última generación, smartphones, laptops y accesorios premium con garantía oficial.",
      category:
        prodCategories.find((c) => c.name.toLowerCase().includes("technol")) ||
        prodCategories[0],
      city: quitoCity,
      logo: "https://images.unsplash.com/photo-1550009158-9ebf69173e03?auto=format&fit=crop&w=400&q=80",
      cover:
        "https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&w=1200&q=80",
      phone: "+593984123456",
      whatsapp: "+593984123456",
      address: "Av. Amazonas y Naciones Unidas",
    },
    {
      type: STORE_TYPE.PRODUCT_STORE,
      name: "SuperMercado Express Del Valle",
      desc: "Productos frescos, alimentos orgánicos, abarrotes y bebidas con los mejores precios del mercado y entrega a domicilio.",
      category:
        prodCategories.find((c) => c.name.toLowerCase().includes("food")) ||
        prodCategories[1],
      city: guayaquilCity,
      logo: "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=400&q=80",
      cover:
        "https://images.unsplash.com/photo-1506617420156-8e4536971650?auto=format&fit=crop&w=1200&q=80",
      phone: "+593992345678",
      whatsapp: "+593992345678",
      address: "Av. 9 de Octubre y Boyacá",
    },
    {
      type: STORE_TYPE.PRODUCT_STORE,
      name: "Moda Urbana & Boutique Elegance",
      desc: "Ropa moderna, calzado deportivo y accesorios de alta calidad para damas, caballeros y jóvenes con las últimas tendencias.",
      category:
        prodCategories.find((c) => c.name.toLowerCase().includes("fashion")) ||
        prodCategories[2],
      city: quitoCity,
      logo: "https://images.unsplash.com/photo-1445205170230-053b83016050?auto=format&fit=crop&w=400&q=80",
      cover:
        "https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=1200&q=80",
      phone: "+593973456789",
      whatsapp: "+593973456789",
      address: "Centro Comercial Iñaquito, Local 42",
    },
    {
      type: STORE_TYPE.PRODUCT_STORE,
      name: "AutoRepuestos del Pacífico",
      desc: "Repuestos originales y alternativos para vehículos japoneses, americanos y europeos con asesoría técnica especializada.",
      category:
        prodCategories.find((c) => c.name.toLowerCase().includes("vehicle")) ||
        prodCategories[3],
      city: guayaquilCity,
      logo: "https://images.unsplash.com/photo-1486006920555-c77dce18193b?auto=format&fit=crop&w=400&q=80",
      cover:
        "https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=1200&q=80",
      phone: "+593964567890",
      whatsapp: "+593964567890",
      address: "Av. de las Américas y Plaza Dañín",
    },
    {
      type: STORE_TYPE.PRODUCT_STORE,
      name: "Mueblería & Confort Hogar",
      desc: "Muebles modernos, juegos de sala, comedores y colchones ortopédicos diseñados para transformar tu espacio familiar.",
      category:
        prodCategories.find((c) => c.name.toLowerCase().includes("home")) ||
        prodCategories[4],
      city: esmeraldasCity,
      logo: "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=400&q=80",
      cover:
        "https://images.unsplash.com/photo-1524758631624-e2822e304c36?auto=format&fit=crop&w=1200&q=80",
      phone: "+593955678901",
      whatsapp: "+593955678901",
      address: "Calle Bolívar y Rocafuerte",
    },

    // 5 Service Stores
    {
      type: STORE_TYPE.SERVICE_STORE,
      name: "ServiPro - Limpieza & Mantenimiento Integral",
      desc: "Empresa profesional de limpieza profunda para casas, oficinas y locales comerciales con equipos industriales y personal calificado.",
      category:
        servCategories.find(
          (c) =>
            c.name.toLowerCase().includes("limpieza") ||
            c.name.toLowerCase().includes("albañil"),
        ) || servCategories[0],
      city: quitoCity,
      logo: "https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=400&q=80",
      cover:
        "https://images.unsplash.com/photo-1527515637462-cff94eecc1ac?auto=format&fit=crop&w=1200&q=80",
      phone: "+593946789012",
      whatsapp: "+593946789012",
      address: "Av. República del Salvador 345",
    },
    {
      type: STORE_TYPE.SERVICE_STORE,
      name: "González & Asociados - Asesoría Legal y Tributaria",
      desc: "Firma de abogados y consultores tributarios con más de 15 años de experiencia en derecho laboral, societario y litigios.",
      category:
        servCategories.find((c) => c.name.toLowerCase().includes("abogado")) ||
        servCategories[1],
      city: guayaquilCity,
      logo: "https://images.unsplash.com/photo-1589829545856-d10d557cf95f?auto=format&fit=crop&w=400&q=80",
      cover:
        "https://images.unsplash.com/photo-1450133064473-71024230f91b?auto=format&fit=crop&w=1200&q=80",
      phone: "+593937890123",
      whatsapp: "+593937890123",
      address: "Edificio Las Cámaras, Piso 8",
    },
    {
      type: STORE_TYPE.SERVICE_STORE,
      name: "Estudio de Arquitectura e Ingeniería Constructora",
      desc: "Diseño de planos, visualización 3D, remodelaciones integrales y construcción de obras residenciales y comerciales.",
      category:
        servCategories.find((c) =>
          c.name.toLowerCase().includes("arquitecto"),
        ) || servCategories[2],
      city: quitoCity,
      logo: "https://images.unsplash.com/photo-1503387762-592deb58ef4e?auto=format&fit=crop&w=400&q=80",
      cover:
        "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1200&q=80",
      phone: "+593928901234",
      whatsapp: "+593928901234",
      address: "Av. Eloy Alfaro y Portugal",
    },
    {
      type: STORE_TYPE.SERVICE_STORE,
      name: "Clínica Odontológica y Médica San Rafael",
      desc: "Atención médica integral, odontología avanzada, ortodoncia e implantes dentales con tecnología de punta y máxima bioseguridad.",
      category:
        servCategories.find((c) => c.name.toLowerCase().includes("médico")) ||
        servCategories[3],
      city: santaElenaCity,
      logo: "https://images.unsplash.com/photo-1629909613654-28e377c37b09?auto=format&fit=crop&w=400&q=80",
      cover:
        "https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?auto=format&fit=crop&w=1200&q=80",
      phone: "+593919012345",
      whatsapp: "+593919012345",
      address: "Av. Principal y Calle 10, Salinas",
    },
    {
      type: STORE_TYPE.SERVICE_STORE,
      name: "Salón de Belleza & Spa Elegance VIP",
      desc: "Estilistas expertos en colorimetría, cortes de cabello, manicura, pedicura spa y masajes relajantes para una experiencia única.",
      category:
        servCategories.find(
          (c) =>
            c.name.toLowerCase().includes("psicólogo") ||
            c.name.toLowerCase().includes("médico"),
        ) || servCategories[4],
      city: guayaquilCity,
      logo: "https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=400&q=80",
      cover:
        "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=1200&q=80",
      phone: "+593901123456",
      whatsapp: "+593901123456",
      address: "Samborondón Plaza, Local 18",
    },
  ];

  const createdStores: any[] = [];
  const createdSellers: any[] = [];
  const createdSubscriptions: any[] = [];
  const createdTransactions: any[] = [];

  const oneYearFromNow = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

  for (let i = 0; i < sellerUsers.length; i++) {
    const user = sellerUsers[i];
    const cfg = storeConfigs[i % storeConfigs.length];

    // 1. Create Store
    const store = await Store.create({
      owner: user._id,
      storeType: cfg.type,
      displayName: cfg.name,
      description: cfg.desc,
      categoryId: cfg.category?._id,
      cityId: cfg.city._id,
      logo: cfg.logo,
      coverImage: cfg.cover,
      phone: cfg.phone,
      whatsapp: cfg.whatsapp,
      email: user.email,
      streetAddress: cfg.address,
      country: cfg.city.country || "Ecuador",
      province: cfg.city.province || "",
      city: cfg.city.city,
      canton: cfg.city.canton || cfg.city.city,
      sector: cfg.city.sector || "",
      neighborhood: cfg.city.neighborhood || "",
      latitude: cfg.city.latitude,
      longitude: cfg.city.longitude,
      postalCode: "170150",
      businessLicenseNumber: `RUC-${1790000000001 + i}`,
      tinNumber: `TIN-${100000 + i}`,
      documentType: DOCUMENT_TYPE.NID,
      documentNumber: `17123456${i}`,
      status: STORE_STATUS.ACTIVE,
      isVerified: true,
      visitorCount: 150 + i * 35,
      averageRating: 4.8,
      ratingCount: 8 + i,
      workingDays: [
        DAYS.MONDAY,
        DAYS.TUESDAY,
        DAYS.WEDNESDAY,
        DAYS.THURSDAY,
        DAYS.FRIDAY,
        DAYS.SATURDAY,
      ],
      openingTime: "08:30",
      closingTime: "19:30",
      isOpen24Hours: false,
    });
    createdStores.push(store);

    // 2. Create Seller record
    const seller = await Seller.create({
      user: user._id,
      store: store._id,
      status: "active",
    });
    createdSellers.push(seller);

    // 3. Create Subscription purchase for store creation
    const subTrxId = `TRX-SUB-${Date.now()}-${i + 1}`;
    const subscription = await Subscription.create({
      userId: user._id,
      packageId: storePackage._id,
      packageType: "store_creation",
      status: "active",
      expiresAt: oneYearFromNow,
      amountPaid: storePackage.price,
      trxId: subTrxId,
      checkoutSessionId: `cs_store_${Date.now()}_${i + 1}`,
      invoiceNumber: `INV-2026-${1000 + i + 1}`,
      invoiceUrl: `/uploads/invoices/inv-2026-${1000 + i + 1}.pdf`,
    });
    createdSubscriptions.push(subscription);

    // 4. Create Transaction record
    const transaction = await Transaction.create({
      transactionId: subTrxId,
      userId: user._id,
      packageId: storePackage._id,
      storeId: store._id,
      amount: storePackage.price,
      paymentMethod: PAYMENT_METHOD.DATAFAST,
      paymentStatus: PAYMENT_STATUS.PAID,
      transactionType: TRANSACTION_TYPE.SUBSCRIPTION_PAYMENT,
      gatewayTransactionId: `gw_datafast_sub_${Date.now()}_${i + 1}`,
      description: `Compra de membresía de tienda: ${storePackage.name}`,
    });
    createdTransactions.push(transaction);

    // 5. Update user state with full matched store data
    const storeLocation = {
      type: "Point",
      coordinates: [store.longitude || -78.52495, store.latitude || -0.22985],
      address: store.streetAddress || `${store.city}, Ecuador`,
      country: store.country || "Ecuador",
      province: store.province || "Pichincha",
      city: store.city || "Quito",
      canton: store.canton || store.city || "Quito",
      sector: store.sector || "",
      neighborhood: store.neighborhood || "",
    };

    await db.collection("users").updateOne(
      { _id: user._id },
      {
        $set: {
          role: "user",
          activeRole: "seller",
          status: "active",
          verified: true,
          isVerified: true,
          password: commonPasswordHash,
          subscriptionStatus: "active",
          subscriptionPackageId: storePackage._id,
          subscriptionExpiresAt: oneYearFromNow,
          phone: store.phone || "+593984123456",
          countryCode: "+593",
          country: store.country || "Ecuador",
          province: store.province || "Pichincha",
          city: store.city || "Quito",
          canton: store.canton || store.city || "Quito",
          sector: store.sector || "",
          neighborhood: store.neighborhood || "",
          postalCode: store.postalCode || "170150",
          address: store.streetAddress || `${store.city}, Ecuador`,
          documentType: store.documentType || "nid",
          documentNumber: store.documentNumber || "1712345678",
          documentFront:
            store.documentFront || "/uploads/documentFront/sample-front.jpg",
          documentBack:
            store.documentBack || "/uploads/documentBack/sample-back.jpg",
          location: storeLocation,
          averageRating: store.averageRating || 5.0,
          totalRatings: store.ratingCount || 10,
          totalReviews: store.ratingCount || 10,
          timezone: "America/Guayaquil",
        },
      },
    );

    console.log(
      `   ✔ [Store ${i + 1}] "${store.displayName}" (${cfg.type}) created for ${user.name}`,
    );
  }

  // 6. Create Products for Product Stores
  console.log("\n📦 Step 6: Creating Products for Product Stores...");
  const createdProducts: any[] = [];

  const productTemplates = [
    {
      title: "Apple iPhone 15 Pro Max 256GB Titanio Natural",
      activePrice: 1299,
      originalPrice: 1450,
      description:
        "Diseño de titanio aeroespacial resistente y ligero, Chip A17 Pro potente, cámara principal de 48 MP con zoom óptico 5x y puerto USB-C de alta velocidad.",
      additionalInfo:
        "Incluye garantía oficial de 1 año, cable USB-C y adaptador de carga rápida.",
      images: [
        "https://images.unsplash.com/photo-1511707171634-5f897ff02560?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1592750475338-74b7b21085ab?auto=format&fit=crop&w=800&q=80",
      ],
    },
    {
      title: "MacBook Pro 14 M3 Pro 18GB RAM 512GB SSD Negro Espacial",
      activePrice: 2199,
      originalPrice: 2399,
      description:
        "Pantalla Liquid Retina XDR espectacular con más de 1000 nits, rendimiento extremo para desarrolladores y creadores con autonomía de hasta 18 horas.",
      additionalInfo:
        "Teclado retroiluminado en español, cargador MagSafe 3 de 70W.",
      images: [
        "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1611186871348-b1ce696e52c9?auto=format&fit=crop&w=800&q=80",
      ],
    },
    {
      title: "Auriculares Sony WH-1000XM5 con Cancelación de Ruido Activa",
      activePrice: 389,
      originalPrice: 449,
      description:
        "Líderes en cancelación de ruido con procesador V1, llamadas ultra nítidas con 4 micrófonos beamforming y hasta 30 horas de reproducción continua.",
      additionalInfo:
        "Estuche de transporte premium y cable de carga rápida incluidos.",
      images: [
        "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1484704849700-f032a568e944?auto=format&fit=crop&w=800&q=80",
      ],
    },
    {
      title: "Smart TV Samsung 65 Pulgadas QLED 4K UHD Smart Hub",
      activePrice: 899,
      originalPrice: 1099,
      description:
        "Colores 100% reales con Quantum Dot, procesador Quantum 4K Lite con escalador inteligente, sonido envolvente Object Tracking Sound Lite y diseño AirSlim.",
      additionalInfo:
        "3 puertos HDMI 2.1, 2 puertos USB, control remoto solar ecológico.",
      images: [
        "https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?auto=format&fit=crop&w=800&q=80",
      ],
    },
    {
      title: "Café Gourmet Ecuatoriano de Altura Loja 1000g Grano Selecto",
      activePrice: 18.5,
      originalPrice: 22.0,
      description:
        "Café 100% arábica cultivado a más de 1900 msnm en los valles de Loja. Tueste medio con notas a chocolate, caramelo y cítricos suaves.",
      additionalInfo:
        "Empaque con válvula desgasificadora para máxima frescura.",
      images: [
        "https://images.unsplash.com/photo-1587734195503-904fca47e0e9?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=800&q=80",
      ],
    },
    {
      title: "Canasta Familiar Completa de Abarrotes y Productos Frescos",
      activePrice: 45.0,
      originalPrice: 55.0,
      description:
        "Incluye arroz premium, aceite vegetal, azúcar morena, leche entera, atún en trozos, fideos, granos andinos y avena fortificada.",
      additionalInfo:
        "Seleccionado con los más altos estándares de higiene y frescura.",
      images: [
        "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=800&q=80",
      ],
    },
    {
      title: "Casaca de Cuero Sintético Premium para Caballero Estilo Rider",
      activePrice: 79.99,
      originalPrice: 99.99,
      description:
        "Confección de alta durabilidad con forro térmico interno, cremalleras metálicas reforzadas YKK y corte slim moderno y elegante.",
      additionalInfo:
        "Disponible en tallas S, M, L y XL. Color negro azabache.",
      images: [
        "https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1551028719-00167b16eac5?auto=format&fit=crop&w=800&q=80",
      ],
    },
    {
      title: "Zapatillas Deportivas Running Ultra Confort Transpirables",
      activePrice: 65.0,
      originalPrice: 85.0,
      description:
        "Suela con amortiguación de impacto de alto rendimiento, malla textil transpirable anti-sudor y plantilla ergonómica con soporte de arco.",
      additionalInfo:
        "Ideal para correr, entrenamiento en gimnasio y uso diario urbano.",
      images: [
        "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=800&q=80",
      ],
    },
    {
      title: "Batería Automotriz Bosch S4 12V 70Ah Libre de Mantenimiento",
      activePrice: 115.0,
      originalPrice: 135.0,
      description:
        "Tecnología PowerFrame para máxima potencia de arranque en frío, resistencia superior a la corrosión y vida útil prolongada.",
      additionalInfo:
        "Garantía de 18 meses con instalación y revisión eléctrica gratuita.",
      images: [
        "https://images.unsplash.com/photo-1486006920555-c77dce18193b?auto=format&fit=crop&w=800&q=80",
      ],
    },
    {
      title: "Juego de Sala Modular Esquinero Contemporáneo 5 Puestos",
      activePrice: 650.0,
      originalPrice: 780.0,
      description:
        "Estructura de madera sólida de roble tratada contra humedad y plagas, tapizado en tela antifluidos lavable y espuma de alta densidad.",
      additionalInfo:
        "Incluye 4 cojines decorativos de obsequio y mesa de centro de madera.",
      images: [
        "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1493663284031-b7e3aefcae8e?auto=format&fit=crop&w=800&q=80",
      ],
    },
  ];

  const productStores = createdStores.filter(
    (s) => s.storeType === STORE_TYPE.PRODUCT_STORE,
  );
  for (let sIdx = 0; sIdx < productStores.length; sIdx++) {
    const store = productStores[sIdx];
    // Assign 3-4 products per store
    const storeProducts = productTemplates.slice(sIdx * 2, sIdx * 2 + 4);
    for (const prod of storeProducts) {
      const p = await Product.create({
        sellerId: store.owner,
        storeId: store._id,
        title: prod.title,
        activePrice: prod.activePrice,
        originalPrice: prod.originalPrice,
        description: prod.description,
        additionalInformation: prod.additionalInfo,
        images: prod.images,
        status: PRODUCT_STATUS.ACTIVE,
      });
      createdProducts.push(p);
      console.log(
        `   ✔ Product created: "${p.title}" ($${p.activePrice}) for "${store.displayName}"`,
      );
    }
  }

  // 7. Create Services for Service Stores
  console.log("\n🛠️ Step 7: Creating Services for Service Stores...");
  const createdServices: any[] = [];

  const serviceTemplates = [
    {
      title:
        "Limpieza Profunda y Sanitización Integral de Casas y Departamentos",
      activePrice: 45.0,
      originalPrice: 60.0,
      description:
        "Servicio completo de limpieza profesional y desinfección total de interiores realizado por personal capacitado con maquinaria industrial y productos biodegradables.",
      whatsIncluded: [
        "Limpieza a fondo de cocina, desengrasado de campana y hornos",
        "Desinfección profunda de azulejos, grifería e inodoros en baños",
        "Aspirado y trapeado con desinfectante en dormitorios y salas",
        "Limpieza de ventanas, marcos y puertas interiores",
      ],
      images: [
        "https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1527515637462-cff94eecc1ac?auto=format&fit=crop&w=800&q=80",
      ],
    },
    {
      title: "Lavado y Desinfección Profunda de Muebles, Alfombras y Colchones",
      activePrice: 35.0,
      originalPrice: 45.0,
      description:
        "Eliminación de manchas difíciles, ácaros, bacterias y malos olores mediante sistema de inyección y extracción de vapor a alta presión.",
      whatsIncluded: [
        "Aspirado industrial previo para remover polvo y partículas",
        "Aplicación de shampoo anti-ácaros hipoalergénico",
        "Extracción profunda y secado rápido al 85%",
        "Tratamiento protector de telas contra líquidos",
      ],
      images: [
        "https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&w=800&q=80",
      ],
    },
    {
      title: "Constitución y Registro Legal de Compañías y Empresas (SAS)",
      activePrice: 180.0,
      originalPrice: 220.0,
      description:
        "Asesoría jurídica integral para crear tu empresa de forma rápida y 100% legal ante la Superintendencia de Compañías y SRI.",
      whatsIncluded: [
        "Elaboración de estatutos sociales personalizados",
        "Reserva de denominación y firma electrónica",
        "Obtención del RUC societario y nombramiento de administradores",
        "Apertura de cuenta bancaria corporativa",
      ],
      images: [
        "https://images.unsplash.com/photo-1589829545856-d10d557cf95f?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1450133064473-71024230f91b?auto=format&fit=crop&w=800&q=80",
      ],
    },
    {
      title: "Asesoría Jurídica y Defensa en Derecho Laboral y Contratos",
      activePrice: 60.0,
      originalPrice: 80.0,
      description:
        "Revisión y elaboración de contratos de trabajo, mediación de finiquitos y liquidaciones, y representación legal en audiencias del Ministerio de Trabajo.",
      whatsIncluded: [
        "Consulta legal presencial o virtual de 60 minutos",
        "Dictamen jurídico por escrito",
        "Negociación de acuerdos de mediación",
      ],
      images: [
        "https://images.unsplash.com/photo-1507679799987-c73779587ccf?auto=format&fit=crop&w=800&q=80",
      ],
    },
    {
      title: "Diseño de Planos Arquitectónicos y Renders 3D Fotorrealistas",
      activePrice: 250.0,
      originalPrice: 320.0,
      description:
        "Planificación integral de proyectos arquitectónicos residenciales y comerciales con recorridos virtuales 3D de alta definición.",
      whatsIncluded: [
        "Levantamiento topográfico y estudio de necesidades",
        "Plantas arquitectónicas acotadas y cortes técnicos",
        "3 vistas exteriores y 3 vistas interiores fotorrealistas",
        "Memoria descriptiva para aprobación municipal",
      ],
      images: [
        "https://images.unsplash.com/photo-1503387762-592deb58ef4e?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=800&q=80",
      ],
    },
    {
      title: "Limpieza Dental Ultrasonido Pro con Blanqueamiento LED",
      activePrice: 40.0,
      originalPrice: 65.0,
      description:
        "Tratamiento odontológico preventivo y estético con raspado ultrasónico de sarro, pulido con pasta profiláctica y sesión de blanqueamiento con luz LED.",
      whatsIncluded: [
        "Valoración odontológica con cámara intraoral",
        "Eliminación de placa bacteriana y sarro con ultrasonido",
        "Pulido dental y aplicación de flúor protector",
        "1 sesión de blanqueamiento estético",
      ],
      images: [
        "https://images.unsplash.com/photo-1629909613654-28e377c37b09?auto=format&fit=crop&w=800&q=80",
      ],
    },
    {
      title: "Paquete Spa Relax VIP: Masaje con Piedras Calientes y Facial",
      activePrice: 50.0,
      originalPrice: 75.0,
      description:
        "Experiencia de relajación total de 90 minutos con masajes descontracturantes, aromaterapia relajante y limpieza facial profunda con mascarilla de oro.",
      whatsIncluded: [
        "Masaje corporal completo de 60 minutos con piedras volcánicas",
        "Aromaterapia con aceites esenciales de lavanda y eucalipto",
        "Limpieza facial e hidratación con ácido hialurónico",
        "Bebida détox y copa de infusión aromática",
      ],
      images: [
        "https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=800&q=80",
      ],
    },
  ];

  const serviceStores = createdStores.filter(
    (s) => s.storeType === STORE_TYPE.SERVICE_STORE,
  );
  for (let sIdx = 0; sIdx < serviceStores.length; sIdx++) {
    const store = serviceStores[sIdx];
    // Assign 3 distinct services per store using modulo indexing
    for (let j = 0; j < 3; j++) {
      const templateIdx = (sIdx * 2 + j) % serviceTemplates.length;
      const serv = serviceTemplates[templateIdx];
      const s = await Service.create({
        sellerId: store.owner,
        storeId: store._id,
        title: `${serv.title}${j > 0 ? "" : ""}`,
        activePrice: serv.activePrice,
        originalPrice: serv.originalPrice,
        description: serv.description,
        whatsIncluded: serv.whatsIncluded,
        images: serv.images,
        status: SERVICE_STATUS.ACTIVE,
      });
      createdServices.push(s);
      console.log(
        `   ✔ Service created: "${s.title}" ($${s.activePrice}) for "${store.displayName}"`,
      );
    }
  }

  // 8. Create Featured Advertisements (User Ads)
  console.log(
    "\n📢 Step 8: Creating Featured Advertisements (User Ads) with Subscriptions & Transactions...",
  );
  const createdAds: any[] = [];

  const adCampaigns = [
    {
      title: "Gran Feria Tecnológica 2026 - Descuentos Hasta 30%",
      store: createdStores[0],
      city: quitoCity,
      position: 1,
      image:
        "https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&w=1200&q=80",
      price: 25,
    },
    {
      title: "Super Ofertas de la Semana - Canasta Familiar al Mejor Precio",
      store: createdStores[1],
      city: guayaquilCity,
      position: 1,
      image:
        "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=1200&q=80",
      price: 25,
    },
    {
      title: "Nueva Colección de Moda Urbana - Temporada Primavera/Verano",
      store: createdStores[2],
      city: quitoCity,
      position: 2,
      image:
        "https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=1200&q=80",
      price: 20,
    },
    {
      title:
        "Servicios de Limpieza Profunda con 20% OFF para Hogares y Negocios",
      store: createdStores[5],
      city: quitoCity,
      position: 3,
      image:
        "https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=1200&q=80",
      price: 20,
    },
    {
      title: "Asesoría Legal Empresarial y Creación de Compañías Rápidas",
      store: createdStores[6],
      city: guayaquilCity,
      position: 2,
      image:
        "https://images.unsplash.com/photo-1450133064473-71024230f91b?auto=format&fit=crop&w=1200&q=80",
      price: 20,
    },
    {
      title:
        "Diseño y Construcción de Casas Modernas - Proyectos Llave en Mano",
      store: createdStores[7],
      city: quitoCity,
      position: 4,
      image:
        "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1200&q=80",
      price: 50,
    },
    {
      title:
        "Sonríe con Confianza: Blanqueamiento Dental y Salud Oral en Salinas",
      store: createdStores[8],
      city: santaElenaCity,
      position: 1,
      image:
        "https://images.unsplash.com/photo-1629909613654-28e377c37b09?auto=format&fit=crop&w=1200&q=80",
      price: 25,
    },
    {
      title: "Muebles de Diseño para tu Hogar con Envíos a Nivel Nacional",
      store: createdStores[4],
      city: esmeraldasCity,
      position: 1,
      image:
        "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=1200&q=80",
      price: 25,
    },
  ];

  const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  for (let aIdx = 0; aIdx < adCampaigns.length; aIdx++) {
    const camp = adCampaigns[aIdx];
    const adTrxId = `TRX-AD-${Date.now()}-${aIdx + 1}`;

    // 1. Create Transaction for Advertisement
    const adTx = await Transaction.create({
      transactionId: adTrxId,
      userId: camp.store.owner,
      packageId: postAddPackage._id,
      storeId: camp.store._id,
      amount: camp.price,
      paymentMethod: PAYMENT_METHOD.DATAFAST,
      paymentStatus: PAYMENT_STATUS.PAID,
      transactionType: TRANSACTION_TYPE.ADVERTISEMENT_PAYMENT,
      gatewayTransactionId: `gw_datafast_ad_${Date.now()}_${aIdx + 1}`,
      description: `Pago de Anuncio Publicitario Destacado: ${camp.title}`,
    });
    createdTransactions.push(adTx);

    // 2. Create Post Add Subscription
    const adSub = await Subscription.create({
      userId: camp.store.owner,
      packageId: postAddPackage._id,
      packageType: "post_add",
      status: "active",
      expiresAt: thirtyDaysFromNow,
      amountPaid: camp.price,
      trxId: adTrxId,
      checkoutSessionId: `cs_ad_${Date.now()}_${aIdx + 1}`,
      invoiceNumber: `INV-AD-${Date.now()}-${aIdx + 1}`,
      cityConfigId: camp.city._id,
      position: camp.position,
    });
    createdSubscriptions.push(adSub);

    // 3. Create Advertisement record
    const ad = await Advertisement.create({
      sellerId: camp.store.owner,
      storeId: camp.store._id,
      advertisementType: ADVERTISEMENT_TYPE.FEATURED,
      campaignName: camp.title,
      cityAdConfigId: camp.city._id,
      country: camp.city.country || "Ecuador",
      countryCode: camp.city.countryCode || "EC",
      province: camp.city.province || "",
      city: camp.city.city,
      canton: camp.city.canton || camp.city.city,
      sector: camp.city.sector || "",
      neighborhood: camp.city.neighborhood || "",
      latitude: camp.city.latitude,
      longitude: camp.city.longitude,
      startDate: new Date(),
      endDate: thirtyDaysFromNow,
      position: camp.position,
      featuredImage: camp.image,
      status: ADVERTISEMENT_STATUS.ACTIVE,
      price: camp.price,
      transactionId: adTx._id,
    });
    createdAds.push(ad);

    console.log(
      `   ✔ Featured Ad created: "${ad.campaignName}" (City: ${camp.city.city}, Slot: #${camp.position})`,
    );
  }

  // 9. Add Realistic Reviews, Favorites and Store Traffic
  console.log(
    "\n⭐ Step 9: Creating Reviews, Favorites, and Visitor Traffic...",
  );
  const sampleComments = [
    "¡Excelente atención al cliente y productos de primera calidad! Muy recomendado.",
    "El servicio superó todas mis expectativas. Puntuales, profesionales y muy amables.",
    "Todo llegó en perfecto estado y en el tiempo acordado. Sin duda volveré a comprar.",
    "Muy satisfecho con la compra, calidad inmejorable y excelente precio.",
    "Gran profesionalismo y seriedad. Se nota el compromiso con sus clientes.",
  ];

  let reviewCount = 0;
  for (let i = 0; i < createdStores.length; i++) {
    const store = createdStores[i];
    const reviewer = regularUsers[i % regularUsers.length];
    if (reviewer && reviewer._id.toString() !== store.owner.toString()) {
      await Review.create({
        storeId: store._id,
        userId: reviewer._id,
        rating: 5,
        comment: sampleComments[i % sampleComments.length],
        ownerReply: {
          comment:
            "¡Muchas gracias por tu reseña y confianza! Estamos para servirte siempre.",
          createdAt: new Date(),
        },
      });
      reviewCount++;

      // Also create favorite
      await Favorite.create({
        userId: reviewer._id,
        targetId: store._id,
        targetType:
          store.storeType === STORE_TYPE.PRODUCT_STORE
            ? FAVORITE_TYPE.PRODUCT_STORE
            : FAVORITE_TYPE.SERVICE_STORE,
      });

      // Also record Store Traffic
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      await StoreTraffic.create({
        storeId: store._id,
        date: today,
        count: 25 + i * 5,
      });
    }
  }
  console.log(
    `   ✔ Created ${reviewCount} 5-star customer reviews, favorites and store traffic logs.`,
  );

  // 10. Update all non-store-owner users (Customers & Admins)
  console.log("\n👤 Step 10: Synchronizing Customer & Buyer accounts...");
  const ownerObjectIds = createdStores.map((s) => s.owner);
  const remainingUsers = await db
    .collection("users")
    .find({
      _id: { $nin: ownerObjectIds },
    })
    .toArray();

  for (const rUser of remainingUsers) {
    const isSuperOrAdmin = ["super_admin", "admin"].includes(rUser.role);
    const customerLocation = {
      type: "Point",
      coordinates: [-78.52495, -0.22985],
      address: "Av. Amazonas y Naciones Unidas, Quito",
      country: "Ecuador",
      province: "Pichincha",
      city: "Quito",
      canton: "Quito",
      sector: "Quito",
      neighborhood: "La Carolina",
    };

    const updateCustomerDoc: any = {
      $set: {
        activeRole: "user",
        status: "active",
        verified: true,
        isVerified: true,
        password: commonPasswordHash,
        subscriptionStatus: "none",
        phone: rUser.phone || "+593991234567",
        countryCode: "+593",
        country: "Ecuador",
        province: "Pichincha",
        city: "Quito",
        canton: "Quito",
        sector: "Quito",
        neighborhood: "La Carolina",
        postalCode: "170150",
        address: "Av. Amazonas y Naciones Unidas, Quito",
        documentType: "nid",
        documentNumber: "1798765432",
        documentFront: "/uploads/documentFront/sample-front.jpg",
        documentBack: "/uploads/documentBack/sample-back.jpg",
        location: customerLocation,
        averageRating: 0,
        totalRatings: 0,
        totalReviews: 0,
        timezone: "America/Guayaquil",
      },
      $unset: {
        subscriptionPackageId: "",
        subscriptionExpiresAt: "",
      },
    };

    if (isSuperOrAdmin) {
      updateCustomerDoc.$set.role = rUser.role;
    } else {
      updateCustomerDoc.$set.role = "user";
    }

    await db
      .collection("users")
      .updateOne({ _id: rUser._id }, updateCustomerDoc);
  }
  console.log(
    `   ✔ Synchronized ${remainingUsers.length} customer and admin user accounts.`,
  );

  console.log("\n=================================================");
  console.log("🎉 DATABASE RESET AND SEEDING COMPLETED!");
  console.log("=================================================");
  console.log(`📊 SUMMARY OF CREATED DATA:`);
  console.log(`   - Users Preserved: ${allUsers.length}`);
  console.log(
    `   - Stores Created: ${createdStores.length} (5 Products, 5 Services)`,
  );
  console.log(`   - Sellers Registered: ${createdSellers.length}`);
  console.log(`   - Products Created: ${createdProducts.length}`);
  console.log(`   - Services Created: ${createdServices.length}`);
  console.log(`   - Featured Ads Created: ${createdAds.length}`);
  console.log(`   - Subscriptions Created: ${createdSubscriptions.length}`);
  console.log(`   - Transactions Created: ${createdTransactions.length}`);
  console.log(`   - Customer Reviews: ${reviewCount}`);
  console.log("=================================================\n");

  await mongoose.disconnect();
  console.log("✔ Disconnected from MongoDB.");
}

runResetAndSeed().catch((err) => {
  console.error("❌ Fatal Error during reset and seed:", err);
  process.exit(1);
});
