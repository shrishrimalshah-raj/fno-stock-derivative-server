import mongoose from 'mongoose';

class RootRepository {
  constructor(model) {
    this._model = model;
  }

  static insertMany(records, model) {
    this._model = model;
    return this._model.insertMany(records);
  }

  findLastRecord(days) {
    return this._model.find({}).sort({ 'date': -1 }).limit(days);
  }

  countDocuments() {
    return this._model.countDocuments({});
  }

  create(item) {
    return this._model.create(item);
  }

  findAll() {
    return this._model.find({});
  }

  update(_id, item) {
    console.log(this.toObjectId(_id))
    return this._model.update({ _id: this.toObjectId(_id) }, item, { upsert: true });
  }

  delete(_id) {
    return this._model.remove({ _id: this.toObjectId(_id) });
  }

  deleteMany() {
    return this._model.deleteMany({});
  }

  findById(_id) {
    return this._model.findById(_id);
  }

  findOne(cond) {
    return this._model.findOne(cond);
  }

  find(cond, fields, options) {
    return this._model.find(cond, options);
  }

  findByDate(cond, fields, options) {
    return this._model.find(cond, options);
  }

  toObjectId(_id) {
    return mongoose.Types.ObjectId.createFromHexString(_id);;
  }

}


export default RootRepository;