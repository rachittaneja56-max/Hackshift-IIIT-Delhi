import {
  CareerReviewDtoSchema,
  type CareerReviewDto,
  type CreateCareerReview,
} from "@trajectoryos/contracts";
import { ApiClient } from "../lib/api.ts";

export function careerApi(api: ApiClient) {
  return {
    create: (input: CreateCareerReview): Promise<CareerReviewDto> =>
      api.request("/career/reviews", CareerReviewDtoSchema, "POST", input),
    get: (id: string): Promise<CareerReviewDto> =>
      api.request(`/career/reviews/${encodeURIComponent(id)}`, CareerReviewDtoSchema),
    resume: (id: string): Promise<CareerReviewDto> =>
      api.request(`/career/reviews/${encodeURIComponent(id)}/resume`, CareerReviewDtoSchema, "POST", {}),
  };
}
