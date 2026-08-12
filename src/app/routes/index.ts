import express from "express";
import { UserRoutes } from "../modules/user/user.routes";
import { AuthRoutes } from "../modules/auth/auth.routes";
import { RuleRoutes } from "../modules/rule/rule.route";
import { FaqRoutes } from "../modules/faq/faq.route";
import { ChatRoutes } from "../modules/chat/chat.routes";
import { MessageRoutes } from "../modules/message/message.routes";
import { SupportRoutes } from "../modules/support/support.route";
import { BannerRoutes } from "../modules/banner/banner.route";
import { StripeRoutes } from "../modules/stripe/stripe.route";
import { NotificationRoutes } from "../modules/notification/notification.routes";
import { FcmTokenRoutes } from "../modules/fcmToken/fcmToken.route";
import { NotificationPreferenceRoutes } from "../modules/notificationPreference/notificationPreference.route";
import { StoreRoutes } from "../modules/store/store.routes";
import { StoreCategoryRoutes } from "../modules/storeCategory/storeCategory.routes";
import { AdvertisementRoutes } from "../modules/advertisement/advertisement.route";
import { CityAdConfigurationRoutes } from "../modules/cityAdConfiguration/cityAdConfiguration.route";

import { ProductRoutes } from "../modules/product/product.routes";
import { ServiceRoutes } from "../modules/service/service.routes";
import { FavoriteRoutes } from "../modules/favorite/favorite.routes";

const router = express.Router();

const apiRoutes = [
  {
    path: "/products",
    route: ProductRoutes,
  },
  {
    path: "/services",
    route: ServiceRoutes,
  },
  {
    path: "/stores",
    route: StoreRoutes,
  },
  {
    path: "/advertisements",
    route: AdvertisementRoutes,
  },
  {
    path: "/city-ad-configurations",
    route: CityAdConfigurationRoutes,
  },
  {
    path: "/categories",
    route: StoreCategoryRoutes,
  },
  {
    path: "/users",
    route: UserRoutes,
  },
  {
    path: "/auth",
    route: AuthRoutes,
  },
  {
    path: "/rules",
    route: RuleRoutes,
  },
  {
    path: "/faqs",
    route: FaqRoutes,
  },
  {
    path: "/chats",
    route: ChatRoutes,
  },
  {
    path: "/messages",
    route: MessageRoutes,
  },
  {
    path: "/supports",
    route: SupportRoutes,
  },
  {
    path: "/banners",
    route: BannerRoutes,
  },
  {
    path: "/stripe",
    route: StripeRoutes,
  },
  {
    path: "/notifications",
    route: NotificationRoutes,
  },
  {
    path: "/fcmTokens",
    route: FcmTokenRoutes,
  },

  {
    path: "/notification-preferences",
    route: NotificationPreferenceRoutes,
  },
  {
    path: "/favorites",
    route: FavoriteRoutes,
  },
];

apiRoutes.forEach((route) => router.use(route.path, route.route));
export default router;
