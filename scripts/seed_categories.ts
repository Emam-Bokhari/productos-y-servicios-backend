import mongoose from "mongoose";
import config from "../src/config";
import { StoreCategory } from "../src/app/modules/storeCategory/storeCategory.model";
import { CATEGORY_TYPE } from "../src/app/modules/storeCategory/storeCategory.constant";
import { STATUS } from "../src/constants/status";

const PRODUCT_CATEGORIES = [
  {
    name: "FOOD AND BEVERAGES",
    aliases: ["ALIMENTOS Y BEBIDAS"],
    subCategories: [
      "FRESH FOODS (FRUITS, VEGETABLES, MEAT, SEAFOOD)",
      "PROCESSED FOODS (CANNED FOODS, SNACKS, FROZEN FOODS)",
      "BREAKFASTS, LUNCHES AND SNACKS",
      "ALCOHOLIC AND NON-ALCOHOLIC BEVERAGES",
      "DAIRY PRODUCTS",
      "BAKERY AND PASTRY",
      "ORGANIC AND HEALTHY PRODUCTS",
    ],
  },
  {
    name: "TECHNOLOGY AND ELECTRONICS",
    aliases: ["TECNOLOGÍA Y ELECTRÓNICA", "Electronics"],
    subCategories: [
      "COMPUTERS AND LAPTOPS",
      "SMART DEVICES",
      "HOME APPLIANCES",
      "AUDIO AND TV EQUIPMENT",
      "TABLETS",
      "MOBILE PHONES",
    ],
  },
  {
    name: "FASHION AND TEXTILES",
    aliases: ["MODA Y TEXTILES"],
    subCategories: [
      "ACCESSORIES (WATCHES, JEWELRY, BELTS)",
      "FOOTWEAR",
      "CASUAL AND FORMAL CLOTHING",
      "SPORTSWEAR",
      "UNIFORMS",
    ],
  },
  {
    name: "HEALTH AND BEAUTY",
    aliases: ["SALUD Y BELLEZA"],
    subCategories: [
      "COSMETICS",
      "MEDICATIONS",
      "PERFUMERY",
      "PERSONAL HYGIENE PRODUCTS",
      "VITAMIN SUPPLEMENTS",
    ],
  },
  {
    name: "HOME AND CONSTRUCTION",
    aliases: ["HOGAR", "CONSTRUCCIÓN"],
    subCategories: [
      "DECORATION",
      "TOOLS",
      "CONSTRUCTION MATERIALS",
      "FURNITURE",
      "PAINTS AND FINISHES",
    ],
  },
  {
    name: "VEHICLES AND TRANSPORTATION",
    aliases: ["VEHÍCULOS Y TRANSPORTE"],
    subCategories: [
      "AUTOMOBILES",
      "BICYCLES",
      "HEAVY MACHINERY",
      "MOTORCYCLES",
      "SPARE PARTS AND ACCESSORIES",
    ],
  },
  {
    name: "INDUSTRIAL PRODUCTS",
    aliases: [],
    subCategories: [
      "ELECTRONIC COMPONENTS",
      "INDUSTRIAL SAFETY EQUIPMENT",
      "AGRICULTURAL SUPPLIES",
      "INDUSTRIAL MACHINERY",
      "RAW MATERIALS (STEEL, WOOD, PETROLEUM)",
      "INDUSTRIAL CHEMICAL PRODUCTS",
    ],
  },
  {
    name: "DIGITAL PRODUCTS",
    aliases: [],
    subCategories: [
      "MOBILE APPLICATIONS",
      "MULTIMEDIA CONTENT",
      "CRYPTOCURRENCIES",
      "ONLINE COURSES",
      "E-BOOKS",
      "SOFTWARE",
      "DIGITAL SUBSCRIPTIONS",
    ],
  },
  {
    name: "OTHER",
    aliases: ["OTROS."],
    subCategories: [],
  },
];

const SERVICE_CATEGORIES = [
  {
    name: "PROFESSIONAL SERVICES",
    aliases: [],
    subCategories: [
      "LAWYERS",
      "ARCHITECTS",
      "AUDITORS",
      "BUSINESS CONSULTANTS",
      "ACCOUNTANTS",
      "ENGINEERS",
      "DOCTORS",
      "PSYCHOLOGISTS",
    ],
  },
  {
    name: "TECHNICAL SERVICES AND TRADES",
    aliases: [],
    subCategories: [
      "BRICKLAYERS",
      "CARPENTERS",
      "ELECTRICIANS",
      "GAS FITTERS / PLUMBERS",
      "MECHANICS",
      "PAINTERS",
      "WELDERS",
      "REFRIGERATION TECHNICIANS",
    ],
  },
  {
    name: "BEAUTY AND AESTHETIC SERVICES",
    aliases: [],
    subCategories: [
      "BARBERSHOPS",
      "HAIR REMOVAL",
      "BODY AESTHETICS",
      "MANICURE AND PEDICURE",
      "HAIR SALONS",
      "SPAS",
      "FACIAL TREATMENTS",
    ],
  },
  {
    name: "EDUCATION AND CHILDCARE SERVICES",
    aliases: [],
    subCategories: [
      "COACHING",
      "COURSES AND TRAINING",
      "SCHOOLS",
      "DAYCARE CENTERS",
      "INSTITUTES",
      "TUTORING",
      "UNIVERSITIES",
    ],
  },
  {
    name: "FINANCIAL SERVICES",
    aliases: [],
    subCategories: [
      "FINANCIAL ADVISORY",
      "BANKS",
      "SECURITIES FIRMS",
      "COOPERATIVES",
      "MICROFINANCE INSTITUTIONS",
      "INSURANCE",
    ],
  },
  {
    name: "TRANSPORTATION AND LOGISTICS SERVICES",
    aliases: [],
    subCategories: [
      "VEHICLE RENTAL",
      "COURIER SERVICES",
      "INTERNATIONAL SHIPPING",
      "MOVING SERVICES",
      "PRIVATE TRANSPORTATION",
      "PUBLIC TRANSPORTATION",
    ],
  },
  {
    name: "ENTERTAINMENT AND TOURISM SERVICES",
    aliases: [],
    subCategories: [
      "TRAVEL AGENCIES",
      "ENTERTAINMENT AND ANIMATION SERVICES",
      "RECREATIONAL CENTERS",
      "NIGHTCLUBS",
      "HOTELS",
      "EVENT ORGANIZATION",
      "RESTAURANTS",
    ],
  },
  {
    name: "HEALTH SERVICES",
    aliases: [],
    subCategories: [
      "AMBULANCE SERVICES",
      "CLINICS",
      "PHYSIOTHERAPY",
      "HOSPITALS",
      "LABORATORIES",
      "DENTISTRY",
    ],
  },
  {
    name: "BUSINESS SERVICES",
    aliases: [],
    subCategories: [
      "CALL CENTERS",
      "WEB DEVELOPMENT",
      "DIGITAL MARKETING",
      "OUTSOURCING",
      "ADVERTISING",
      "HUMAN RESOURCES",
      "PRIVATE SECURITY",
    ],
  },
  {
    name: "HOME SERVICES",
    aliases: [],
    subCategories: [
      "CHAIR AND TABLE RENTAL",
      "ELDERLY CARE",
      "CHILDCARE",
      "GARDENING",
      "LAUNDRY",
      "DOMESTIC CLEANING",
      "GENERAL REPAIRS",
    ],
  },
  {
    name: "REAL ESTATE SERVICES (RENTAL AND SALE)",
    aliases: [],
    subCategories: [
      "WAREHOUSE RENTAL",
      "HOUSE RENTAL",
      "APARTMENT RENTAL",
      "COMMERCIAL PROPERTY RENTAL",
      "OFFICE RENTAL",
      "SUITE RENTAL",
      "LAND RENTAL",
      "VACATION RENTAL (AIRBNB)",
      "SALE",
    ],
  },
  {
    name: "OTHER",
    aliases: ["OTROS"],
    subCategories: [],
  },
];

const seedCategories = async () => {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(config.database_url as string);
    console.log("Connected to MongoDB successfully!");

    const collection = mongoose.connection.collection("storecategories");

    // 1. Drop old single-field unique index 'name_1' if present
    try {
      const indexes = await collection.indexes();
      const hasNameIndex = indexes.some((idx) => idx.name === "name_1");
      if (hasNameIndex) {
        console.log("Dropping legacy unique index 'name_1'...");
        await collection.dropIndex("name_1");
        console.log("Legacy index 'name_1' dropped successfully.");
      }
    } catch (e: any) {
      console.warn("Notice while checking/dropping name_1 index:", e.message);
    }

    // 2. Process Product Categories
    console.log("\n--- Seeding Product Categories ---");
    for (const group of PRODUCT_CATEGORIES) {
      let parentCat = await StoreCategory.findOne({
        name: group.name,
        type: CATEGORY_TYPE.PRODUCT,
        parentId: null,
      });

      if (!parentCat && group.aliases.length > 0) {
        parentCat = await StoreCategory.findOne({
          name: { $in: group.aliases },
          type: CATEGORY_TYPE.PRODUCT,
          parentId: null,
        });
      }

      if (parentCat) {
        if (parentCat.name !== group.name) {
          console.log(`Updating existing product category "${parentCat.name}" -> "${group.name}" (_id: ${parentCat._id})`);
          parentCat.name = group.name;
          parentCat.status = STATUS.ACTIVE;
          parentCat.parentId = null;
          await parentCat.save();
        } else {
          console.log(`Product category already exists: "${group.name}" (_id: ${parentCat._id})`);
        }
      } else {
        parentCat = await StoreCategory.create({
          name: group.name,
          type: CATEGORY_TYPE.PRODUCT,
          status: STATUS.ACTIVE,
          parentId: null,
        });
        console.log(`Created product category: "${group.name}" (_id: ${parentCat._id})`);
      }

      // Seed subcategories
      for (const subName of group.subCategories) {
        let subCat = await StoreCategory.findOne({
          name: subName,
          type: CATEGORY_TYPE.PRODUCT,
          parentId: parentCat._id,
        });

        if (!subCat) {
          subCat = await StoreCategory.create({
            name: subName,
            type: CATEGORY_TYPE.PRODUCT,
            status: STATUS.ACTIVE,
            parentId: parentCat._id,
          });
          console.log(`  └─ Created subcategory: "${subName}" (_id: ${subCat._id})`);
        } else {
          console.log(`  └─ Subcategory exists: "${subName}" (_id: ${subCat._id})`);
        }
      }
    }

    // 3. Process Service Categories
    console.log("\n--- Seeding Service Categories ---");
    for (const group of SERVICE_CATEGORIES) {
      let parentCat = await StoreCategory.findOne({
        name: group.name,
        type: CATEGORY_TYPE.SERVICE,
        parentId: null,
      });

      if (!parentCat && group.aliases.length > 0) {
        parentCat = await StoreCategory.findOne({
          name: { $in: group.aliases },
          type: CATEGORY_TYPE.SERVICE,
          parentId: null,
        });
      }

      if (parentCat) {
        if (parentCat.name !== group.name) {
          console.log(`Updating existing service category "${parentCat.name}" -> "${group.name}" (_id: ${parentCat._id})`);
          parentCat.name = group.name;
          parentCat.status = STATUS.ACTIVE;
          parentCat.parentId = null;
          await parentCat.save();
        } else {
          console.log(`Service category already exists: "${group.name}" (_id: ${parentCat._id})`);
        }
      } else {
        parentCat = await StoreCategory.create({
          name: group.name,
          type: CATEGORY_TYPE.SERVICE,
          status: STATUS.ACTIVE,
          parentId: null,
        });
        console.log(`Created service category: "${group.name}" (_id: ${parentCat._id})`);
      }

      // Seed subcategories
      for (const subName of group.subCategories) {
        let subCat = await StoreCategory.findOne({
          name: subName,
          type: CATEGORY_TYPE.SERVICE,
          parentId: parentCat._id,
        });

        if (!subCat) {
          subCat = await StoreCategory.create({
            name: subName,
            type: CATEGORY_TYPE.SERVICE,
            status: STATUS.ACTIVE,
            parentId: parentCat._id,
          });
          console.log(`  └─ Created subcategory: "${subName}" (_id: ${subCat._id})`);
        } else {
          console.log(`  └─ Subcategory exists: "${subName}" (_id: ${subCat._id})`);
        }
      }
    }

    console.log("\nSeeding completed successfully!");
    const totalCount = await StoreCategory.countDocuments({});
    const parentCount = await StoreCategory.countDocuments({ parentId: null });
    const subCount = await StoreCategory.countDocuments({ parentId: { $ne: null } });
    console.log(`Total categories in DB: ${totalCount} (Main Categories: ${parentCount}, Subcategories: ${subCount})`);

    await mongoose.disconnect();
    console.log("Disconnected from MongoDB.");
  } catch (error) {
    console.error("Error during category seeding:", error);
    process.exit(1);
  }
};

seedCategories();
