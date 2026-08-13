import mongoose from "mongoose";
import config from "../src/config";
import { User } from "../src/app/modules/user/user.model";
import { Store } from "../src/app/modules/store/store.model";
import { Review } from "../src/app/modules/review/review.model";
import { ReviewService } from "../src/app/modules/review/review.service";
import { USER_ROLES } from "../src/enums/user";
import { STORE_STATUS, STORE_TYPE } from "../src/app/modules/store/store.constant";

const testReviews = async () => {
  try {
    console.log("Connecting to Database...");
    await mongoose.connect(config.database_url as string);
    console.log("Connected to MongoDB!");

    // 1. Create clean test users and store
    console.log("Cleaning old test data...");
    await User.deleteMany({ email: { $in: ["owner@test.com", "reviewer1@test.com", "reviewer2@test.com"] } });
    await Store.deleteMany({ displayName: "Test Rating Store" });

    console.log("Creating store owner...");
    const owner = await User.create({
      name: "Store Owner",
      email: "owner@test.com",
      phone: "+1234567890",
      role: USER_ROLES.SELLER,
      activeRole: "seller",
    });

    console.log("Creating reviewer 1...");
    const reviewer1 = await User.create({
      name: "Reviewer One",
      email: "reviewer1@test.com",
      phone: "+1234567891",
      role: USER_ROLES.USER,
      activeRole: "user",
    });

    console.log("Creating reviewer 2...");
    const reviewer2 = await User.create({
      name: "Reviewer Two",
      email: "reviewer2@test.com",
      phone: "+1234567892",
      role: USER_ROLES.USER,
      activeRole: "user",
    });

    console.log("Creating store...");
    const store = await Store.create({
      owner: owner._id,
      displayName: "Test Rating Store",
      description: "A temporary store for rating tests",
      phone: "+1234567890",
      email: "owner@test.com",
      status: STORE_STATUS.ACTIVE,
      storeType: STORE_TYPE.PRODUCT_STORE,
      businessLicenseNumber: "LIC-TEST-12345",
    });

    console.log("Store created! Initial averageRating:", store.averageRating, "Initial ratingCount:", store.ratingCount);

    // Clean any old reviews
    await Review.deleteMany({ storeId: store._id });

    // 2. Try reviewing the own store (Should FAIL)
    console.log("Testing: Owner reviewing own store (should fail)...");
    try {
      await ReviewService.createReviewInDB(owner._id.toString(), {
        storeId: store._id.toString(),
        rating: 5,
        comment: "This is my awesome store!",
      });
      console.error("FAIL: Owner was able to review their own store.");
    } catch (error: any) {
      console.log("SUCCESS: Blocked owner from reviewing own store. Error:", error.message);
    }

    // 3. Reviewer 1 posts a review
    console.log("Testing: Reviewer 1 posting 4-star review...");
    const review1 = await ReviewService.createReviewInDB(reviewer1._id.toString(), {
      storeId: store._id.toString(),
      rating: 4,
      comment: "Good quality products, but a bit slow to ship.",
    });
    console.log("Review 1 created!");

    // Fetch store to verify rating update
    let updatedStore = await Store.findById(store._id);
    console.log("Store averageRating:", updatedStore?.averageRating, "ratingCount:", updatedStore?.ratingCount);
    if (updatedStore?.averageRating !== 4 || updatedStore?.ratingCount !== 1) {
      throw new Error(`FAIL: Store ratings not computed correctly. Expected 4/1, got ${updatedStore?.averageRating}/${updatedStore?.ratingCount}`);
    }

    // 4. Reviewer 1 posts duplicate review (Should FAIL)
    console.log("Testing: Reviewer 1 posting duplicate review (should fail)...");
    try {
      await ReviewService.createReviewInDB(reviewer1._id.toString(), {
        storeId: store._id.toString(),
        rating: 5,
        comment: "Changing my mind, it's 5 stars!",
      });
      console.error("FAIL: Reviewer was able to post duplicate review.");
    } catch (error: any) {
      console.log("SUCCESS: Blocked duplicate review. Error:", error.message);
    }

    // 5. Reviewer 2 posts a 5-star review
    console.log("Testing: Reviewer 2 posting 5-star review...");
    const review2 = await ReviewService.createReviewInDB(reviewer2._id.toString(), {
      storeId: store._id.toString(),
      rating: 5,
      comment: "Excellent service!",
    });
    console.log("Review 2 created!");

    // Fetch store to verify average rating update
    updatedStore = await Store.findById(store._id);
    console.log("Store averageRating:", updatedStore?.averageRating, "ratingCount:", updatedStore?.ratingCount);
    // (4 + 5) / 2 = 4.5
    if (updatedStore?.averageRating !== 4.5 || updatedStore?.ratingCount !== 2) {
      throw new Error(`FAIL: Store ratings not computed correctly. Expected 4.5/2, got ${updatedStore?.averageRating}/${updatedStore?.ratingCount}`);
    }

    // 6. Test store owner reply
    console.log("Testing: Owner replying to Review 1...");
    const repliedReview1 = await ReviewService.replyAsStoreOwnerInDB(owner._id.toString(), review1._id.toString(), {
      comment: "Thank you for your feedback! We will work on faster shipping.",
    });
    console.log("Owner replied successfully:", repliedReview1.ownerReply);

    // 7. Store owner tries to reply again (Should FAIL)
    console.log("Testing: Owner replying again to Review 1 (should fail)...");
    try {
      await ReviewService.replyAsStoreOwnerInDB(owner._id.toString(), review1._id.toString(), {
        comment: "Also, check out our discount code next time!",
      });
      console.error("FAIL: Owner replied more than once.");
    } catch (error: any) {
      console.log("SUCCESS: Blocked owner from replying twice. Error:", error.message);
    }

    // 8. User (reviewer 1) replies to owner's reply
    console.log("Testing: Reviewer 1 replying to owner's response...");
    const fullyRepliedReview1 = await ReviewService.replyAsReviewerInDB(reviewer1._id.toString(), review1._id.toString(), {
      comment: "Thanks for the quick response! Looking forward to it.",
    });
    console.log("Reviewer replied successfully:", fullyRepliedReview1.userReply);

    // 9. Reviewer tries to reply again (Should FAIL)
    console.log("Testing: Reviewer 1 replying again (should fail)...");
    try {
      await ReviewService.replyAsReviewerInDB(reviewer1._id.toString(), review1._id.toString(), {
        comment: "One more thing, are you open on weekends?",
      });
      console.error("FAIL: Reviewer replied more than once.");
    } catch (error: any) {
      console.log("SUCCESS: Blocked reviewer from replying twice. Error:", error.message);
    }

    // 10. Reviewer 2 tries to reply to their own review before owner replies (Should FAIL)
    console.log("Testing: Reviewer 2 replying before owner response (should fail)...");
    try {
      await ReviewService.replyAsReviewerInDB(reviewer2._id.toString(), review2._id.toString(), {
        comment: "Self reply!",
      });
      console.error("FAIL: Reviewer replied before owner responded.");
    } catch (error: any) {
      console.log("SUCCESS: Blocked reviewer reply before owner response. Error:", error.message);
    }

    // 11. Get store reviews and check breakdown
    console.log("Testing: Get store reviews list and rating breakdown stats...");
    const reviewsRes = await ReviewService.getStoreReviewsFromDB({ storeId: store._id.toString() });
    console.log("Reviews retrieved count:", reviewsRes.data.length);
    console.log("Rating stats breakdown:", reviewsRes.ratingStats);
    if (reviewsRes.ratingStats[4] !== 1 || reviewsRes.ratingStats[5] !== 1) {
      throw new Error(`FAIL: Rating stats not computed correctly. Expected {4:1, 5:1}, got ${JSON.stringify(reviewsRes.ratingStats)}`);
    }

    console.log("Cleaning up test data...");
    await User.deleteMany({ email: { $in: ["owner@test.com", "reviewer1@test.com", "reviewer2@test.com"] } });
    await Store.deleteMany({ displayName: "Test Rating Store" });
    await Review.deleteMany({ storeId: store._id });

    console.log("\nALL TESTS PASSED SUCCESSFULLY! ✅");
  } catch (error) {
    console.error("Test execution failed:", error);
  } finally {
    await mongoose.disconnect();
  }
};

testReviews();
