import type { Pool } from "pg";
import { ChallengeDtoSchema, CourseListDtoSchema, LessonDtoSchema } from "@trajectoryos/contracts";
import { notFound } from "../errors.js";

export class ContentService {
  constructor(private pool: Pool) {}
  async manifest(slug = "retry-safe-credit", version = 1) {
    const row = (await this.pool.query("SELECT manifest FROM app.challenge_versions WHERE slug=$1 AND version=$2", [slug, version])).rows[0];
    if (!row) throw notFound(); return row.manifest;
  }
  async courses() { return CourseListDtoSchema.parse((await this.manifest()).courses); }
  async lesson(slug: string, version: string) {
    const lesson = LessonDtoSchema.parse((await this.manifest()).lesson);
    if (lesson.slug !== slug || String(lesson.version) !== version) throw notFound(); return lesson;
  }
  async challenge(slug: string, version: number) { return ChallengeDtoSchema.parse((await this.manifest(slug, version)).challenge); }
}
