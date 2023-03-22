import { CourseInfo as C, GradeTable as G, GradesImpl, COURSES }
  from 'cs544-prj1-sol';

import * as mongo from 'mongodb';

import { okResult, errResult, Result } from 'cs544-js-utils';



export async function makeGradesDao(mongodbUrl: string)
  : Promise<Result<GradesDao>> 
{
  return GradesDao.make(mongodbUrl);
}

export class GradesDao {

  #client: mongo.MongoClient;
  #grades: mongo.Collection;

  private constructor(params: { [key: string]: any }) {
    this.#client = params.client;
    this.#grades = params.grades;
  }

  /** Factory method for constructing a GradesDao.
   */
  static async make(dbUrl: string) : Promise<Result<GradesDao>> {
    const params: {[key: string]: any} = {};
    try{
      const client = new mongo.MongoClient(dbUrl);
      await client.connect();
      const db = client.db();
      const grades = db.collection('grades');
      await grades.createIndex('courseId');
      const params = {client, grades};
      const gradesDao = new GradesDao(params);
      return okResult(gradesDao);
    }
    catch (error){
      return errResult(error.message, 'DB');
    }
  }

  /** Close this DAO. */
  async close() : Promise<Result<void>> {
    try{
      await this.#client.close();
      return okResult(undefined);
    }
    catch(error){
      return errResult(error.message, 'DB');
    }
  }

  async #read(courseId: string): Promise<Result<G.Grades>> {
    const checkCourse = checkCourseId(courseId);
    if (!checkCourse.isOk){
      return errResult(`unknown courseId ${courseId}`, 'BAD_ARG');
    }
    try {
      const gradesSet = this.#grades;
      const gradesResults = await gradesSet.findOne({courseId});
      if (gradesResults){
        const gradesData = {...gradesResults};
        delete gradesData._id;
        return GradesImpl.makeGradesWithData(courseId, gradesData.rawTable);
      } 
      else{
        return GradesImpl.makeGrades(courseId);
      }
    } 
    catch (err){
      return errResult(err.message, 'DB');
    }
  }

  /*async #write(courseId: string, rawTable: G.RawTable): Promise<Result<G.Grades>> {
    try {
      const sets = this.#grades;
      const fillId = { courseId };
      const update = { $set: { rawTable } };
      const choice = { returnOriginal: false, upsert: true };
      const resultGrade = await sets.findOneAndUpdate(fillId, update, choice);
  
      if (!resultGrade) {
        return errResult(`Failed to update grades for courseId: ${courseId}`, 'DB');
      }
  
      const newRawTable = resultGrade.rawTable as G.RawTable;
      const grades = GradesImpl.makeGradesWithData(courseId, newRawTable);
      return okResult(grades);
    } catch (err) {
      return errResult(err.message, 'DB');
    }
  }*/

  async #write(courseId: string, rawTable: G.RawTable)
    : Promise<Result<G.Grades>> 
  {
    try {
      const fill = this.#grades;
      const IDf = { courseId };
      const update = { $set: { rawTable } };
      const choice =
        { upsert: true, returnDocument: mongo.ReturnDocument.AFTER };
      const result = await fill.findOneAndUpdate(IDf, update, choice);
      const grades = result.value?.rawTable ?? {};
      return GradesImpl.makeGradesWithData(courseId, grades);
    }
    catch (error) {
      return errResult(error.message, 'DB');
    }
  }
  

  /** Set grades for courseId to rawRows. 
   *  Errors:
   *   BAD_ARG: courseId is not a valid course-id.
   */
  async load(courseId: string, rawTable: G.RawTable)
    : Promise<Result<G.Grades>>
  {
    const checkResult = checkCourseId(courseId);
    if (!checkResult.isOk){
      return errResult(`unknown course id ${courseId}`, 'BAD_ARG');
    }
    const final = await this.#write(courseId, rawTable);
    return final;
  }
  
  /** Return a Grades object for courseId. 
   *  Errors:
   *   BAD_ARG: courseId is not a valid course-id.
   */
  async getGrades(courseId: string): Promise<Result<G.Grades>> {
    const checkResult = checkCourseId(courseId);
    if (checkResult.isOk) {
      const grades = await this.#read(courseId);
      return grades;
    }
    return errResult(`unknown courseId ${courseId}`, 'BAD_ARG');
  }

  /** Remove all course grades stored by this DAO */
  async clear() : Promise<Result<void>> {
    try{
      await this.#grades.deleteMany();
      return okResult(undefined);
    }
    catch(e){
      return errResult(e.message, 'DB');
    }
  }

  /** Upsert (i.e. insert or replace) row to table and return the new
   *  table.
   *
   *  Error Codes:
   *
   *   'BAD_ARG': row specifies an unknown colId or a calc colId or
   *              contains an extra/missing colId not already in table,
   *              or is missing an id column identifying the row.
   *   'RANGE':   A kind='score' column value is out of range
   */
  async upsertRow(courseId: string, row: G.RawRow) : Promise<Result<G.Grades>> {
    return this.upsertRows(courseId, [row]);
  }

  /** Upsert zero-or-more rows.  Basically upsertRow() for
   *  multiple rows.   Will detect errors in multiple rows.
   */
  async upsertRows(courseId: string, rows: G.RawRow[])
    : Promise<Result<G.Grades>> 
  {
    const checkCourse = checkCourseId(courseId);
    if(!checkCourse.isOk){
        return errResult(`unknown courseId '${courseId}'`, 'BAD_ARG');
    }
    const readColumns = await this.#read(courseId);
    if(!readColumns.isOk){
      return readColumns;
    }
    const grades = readColumns.val;

    for (const row of rows){
      const upsertResults = await this.upsertRow(courseId, row);
      if (!upsertResults.isOk){
        return upsertResults as Result<G.Grades>;
      }
    }
    return this.#write(courseId, grades.getRawTable());
  }

  /** Add an empty column for colId to table.
   *  Errors:
   *    BAD_ARG: colId is already in table or is not a score/info/id colId
   *    for course.
   */
  async addColumn(courseId: string, colId: string) : Promise<Result<G.Grades>> {
    return this.addColumns(courseId, colId);
  }
  
  /** Add empty columns for colId in colIds to table.
   *  Errors:
   *    BAD_ARG: colId is already in table or is not a score/info colId
   *    for course.
   */
  async addColumns(courseId: string, ...colIds: string[]) : Promise<Result<G.Grades>> {
    const checkCourse = checkCourseId(courseId);
    if (!checkCourse.isOk){
     return checkCourse as Result<G.Grades>;
    }
    const readGrades = await this.getGrades(courseId);
    if(readGrades.isOk){
      const addGrades = readGrades.val.addColumns(...colIds);
      if(addGrades.isOk){
        await this.#write(courseId, addGrades.val.getRawTable());
        return okResult(addGrades.val);
      }
      else{
        return addGrades
      }
    }
    else{
      return readGrades;
    }
}

  
  
  /** Apply patches to table, returning the patched table.
   *  Errors:
   *    BAD_ARG: A patch rowId or colId is not in table.
   *    RANGE: Patch data is out-of-range.
   */
  async patch(courseId: string, patches: G.Patches)
    : Promise<Result<G.Grades>> 
  { 
    const checkCourse = checkCourseId(courseId);
      if (!checkCourse.isOk){
        return errResult(`unknown course id ${courseId}`, 'BAD_ARG');
      }
    const grades = await this.getGrades(courseId);
      if (!grades.isOk){
        return grades;
      }
    const patchesR = grades.val.patch(patches);
      if (!patchesR.isOk){
        return patchesR;
      }
    const writePatch = await this.#write(courseId, patchesR.val.getRawTable());
      if (!writePatch.isOk) {
        return writePatch;
      }
    return okResult(patchesR.val);
  }
  //TODO: add private methods  
}

/** Return an error result if courseId is unknown */
function checkCourseId(courseId: string) : Result<void> {
  return (COURSES[courseId])
    ? okResult(undefined)
    : errResult(`unknown course id ${courseId}`);
}

//TODO: add more local functions, constants, etc.

