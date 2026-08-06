import { FilterQuery, Query, Types } from "mongoose";

class QueryBuilder<T> {
  public modelQuery: Query<T[], T>;
  public query: Record<string, unknown>;

  constructor(modelQuery: Query<T[], T>, query: Record<string, unknown>) {
    this.modelQuery = modelQuery;
    this.query = query || {};
  }

  // 🔍 Search (String + ObjectId support)
  search(searchableFields: string[]) {
    const searchTerm = this.query.searchTerm as string;
    if (!searchTerm) return this;

    const orConditions: FilterQuery<T>[] = [];

    // String field search only
    searchableFields.forEach((field) => {
      orConditions.push({
        [field]: { $regex: searchTerm, $options: "i" },
      } as FilterQuery<T>);
    });

    // Support combined brand and model search if both are searchable
    if (
      searchableFields.includes("brand") &&
      searchableFields.includes("model")
    ) {
      orConditions.push({
        $expr: {
          $or: [
            {
              $regexMatch: {
                input: { $concat: ["$brand", " ", "$model"] },
                regex: searchTerm,
                options: "i",
              },
            },
            {
              $regexMatch: {
                input: { $concat: ["$model", " ", "$brand"] },
                regex: searchTerm,
                options: "i",
              },
            },
          ],
        },
      } as FilterQuery<T>);
    }

    // ObjectId exact match
    if (Types.ObjectId.isValid(searchTerm)) {
      orConditions.push({
        _id: new Types.ObjectId(searchTerm),
      } as FilterQuery<T>);
      orConditions.push({
        bookingId: new Types.ObjectId(searchTerm),
      } as FilterQuery<T>);
    }

    this.modelQuery = this.modelQuery.find({ $or: orConditions });
    return this;
  }

  // 🎯 Filter (Boolean, Date, exact match)
  filter() {
    const queryObj = { ...this.query };
    const excludeFields = ["searchTerm", "sort", "limit", "page", "fields"];
    excludeFields.forEach((el) => delete queryObj[el]);

    // HISTORY special case
    if (queryObj.status === "HISTORY") {
      delete queryObj.status;
      this.modelQuery = this.modelQuery
        .where("status")
        .in(["CANCELLED", "COMPLETED"]);
    }

    // Boolean & Date filters (for Booking)
    ["checkIn", "checkOut", "isCancelled"].forEach((field) => {
      if (queryObj[field] !== undefined) {
        this.modelQuery = this.modelQuery.where(field).equals(queryObj[field]);
        delete queryObj[field];
      }
    });

    ["fromDate", "toDate"].forEach((field) => {
      if (queryObj[field]) {
        const date = new Date(queryObj[field] as string);
        if (field === "fromDate")
          this.modelQuery = this.modelQuery
            .where("fromDate")
            .gte(date.getTime());
        if (field === "toDate")
          this.modelQuery = this.modelQuery.where("toDate").lte(date.getTime());
        delete queryObj[field];
      }
    });

    if (Object.keys(queryObj).length > 0) {
      this.modelQuery = this.modelQuery.find(queryObj as FilterQuery<T>);
    }

    return this;
  }

  // ↕️ Sort
  sort() {
    const sort =
      (this.query.sort as string)?.split(",").join(" ") || "-createdAt";
    this.modelQuery = this.modelQuery.sort(sort);
    return this;
  }

  // 📄 Pagination
  paginate() {
    const page = Number(this.query.page) || 1;
    const limit = Number(this.query.limit) || 10;
    const skip = (page - 1) * limit;
    this.modelQuery = this.modelQuery.skip(skip).limit(limit);
    return this;
  }

  // 📌 Field Selection
  fields() {
    const fields =
      (this.query.fields as string)?.split(",").join(" ") || "-__v";
    this.modelQuery = this.modelQuery.select(fields);
    return this;
  }

  // 📊 Meta Count
  async countTotal() {
    const filter = this.modelQuery.getFilter();
    const total = await this.modelQuery.model.countDocuments(filter);
    const page = Number(this.query.page) || 1;
    const limit = Number(this.query.limit) || 10;
    const totalPage = Math.ceil(total / limit);
    return { page, limit, total, totalPage };
  }
}

export default QueryBuilder;
