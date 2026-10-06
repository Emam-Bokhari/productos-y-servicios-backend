# Hub Entity References

This document lists all entities and fields that reference hub entities across the productos-y-servicios-backend codebase.

## Hub: `Store` (9 referencing entities, 9 reference fields)

| Module          | Referencing Entity | Field Path    | Kind                |
| :-------------- | :----------------- | :------------ | :------------------ |
| `advertisement` | `Advertisement`    | `storeId`     | single ref          |
| `product`       | `Product`          | `storeId`     | single ref          |
| `report`        | `Report`           | `targetStore` | single ref          |
| `review`        | `Review`           | `storeId`     | single ref          |
| `seller`        | `Seller`           | `store`       | one-to-one (unique) |
| `service`       | `Service`          | `storeId`     | single ref          |
| `storeTraffic`  | `StoreTraffic`     | `storeId`     | single ref          |
| `transaction`   | `Transaction`      | `storeId`     | single ref          |
| `user`          | `User`             | `_id`         | one-to-one (unique) |

## Hub: `User` (18 referencing entities, 24 reference fields)

| Module                   | Referencing Entity       | Field Path     | Kind                |
| :----------------------- | :----------------------- | :------------- | :------------------ |
| `advertisement`          | `Advertisement`          | `sellerId`     | single ref          |
| `broadcast`              | `Broadcast`              | `createdBy`    | single ref          |
| `chat`                   | `Chat`                   | `deletedBy`    | array of refs       |
| `chat`                   | `Chat`                   | `participants` | array of refs       |
| `chat`                   | `Chat`                   | `readBy`       | array of refs       |
| `favorite`               | `Favorite`               | `userId`       | single ref          |
| `fcmToken`               | `DeviceToken`            | `userId`       | single ref          |
| `message`                | `Message`                | `pinnedBy`     | single ref          |
| `message`                | `Message`                | `sender`       | single ref          |
| `notification`           | `Notification`           | `receiver`     | single ref          |
| `notification`           | `Notification`           | `sender`       | single ref          |
| `notificationPreference` | `NotificationPreference` | `userId`       | one-to-one (unique) |
| `product`                | `Product`                | `sellerId`     | single ref          |
| `report`                 | `Report`                 | `reporterId`   | single ref          |
| `report`                 | `Report`                 | `resolvedBy`   | single ref          |
| `report`                 | `Report`                 | `targetUser`   | single ref          |
| `resetToken`             | `Token`                  | `user`         | single ref          |
| `review`                 | `Review`                 | `userId`       | single ref          |
| `seller`                 | `Seller`                 | `user`         | one-to-one (unique) |
| `service`                | `Service`                | `sellerId`     | single ref          |
| `store`                  | `Store`                  | `owner`        | one-to-one (unique) |
| `subscription`           | `Subscription`           | `userId`       | single ref          |
| `support`                | `Support`                | `userId`       | single ref          |
| `transaction`            | `Transaction`            | `userId`       | single ref          |
