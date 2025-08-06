import { DataTypes, Model } from 'sequelize';
import sequelize from './database';

// User Model
export class User extends Model {
  public id!: string;
  public username!: string;
  public password_hash!: string;
  public role!: 'admin' | 'msu' | 'storage' | 'surgery';
}

User.init({
  id: { type: DataTypes.STRING(36), primaryKey: true },
  username: { type: DataTypes.STRING(50), unique: true, allowNull: false },
  password_hash: { type: DataTypes.STRING(255) },
  role: { type: DataTypes.ENUM('admin', 'msu', 'storage', 'surgery'), allowNull: false }
}, { sequelize, tableName: 'users', underscored: true });

// Medical Item Model
export class MedicalItem extends Model {
  public id!: string;
  public company_prefix!: string;
  public serial_number!: number;
  public item_name!: string;
  public sterilized!: boolean;
  public location!: string;
}

MedicalItem.init({
  id: { type: DataTypes.STRING(36), primaryKey: true },
  company_prefix: { type: DataTypes.STRING(10), allowNull: false },
  serial_number: { type: DataTypes.INTEGER, allowNull: false },
  item_name: { type: DataTypes.STRING(100), allowNull: false },
  sterilized: { type: DataTypes.BOOLEAN, defaultValue: false },
  location: { type: DataTypes.STRING(100), defaultValue: 'MSU' }
}, { sequelize, tableName: 'medical_items', underscored: true });

// Instrument Group Model
export class InstrumentGroup extends Model {
  public id!: string;
  public name!: string;
  public location!: string;
}

InstrumentGroup.init({
  id: { type: DataTypes.STRING(36), primaryKey: true },
  name: { type: DataTypes.STRING(100), allowNull: false },
  location: { type: DataTypes.STRING(100), defaultValue: 'Storage' }
}, { sequelize, tableName: 'instrument_groups', underscored: true });

// Group Items Model
export class GroupItem extends Model {
  public id!: string;
  public group_id!: string;
  public item_id!: string;
  public MedicalItem?: MedicalItem;
}

GroupItem.init({
  id: { type: DataTypes.STRING(36), primaryKey: true },
  group_id: { type: DataTypes.STRING(36), allowNull: false },
  item_id: { type: DataTypes.STRING(36), allowNull: false }
}, { sequelize, tableName: 'group_items', underscored: true });

// Action History Model
export class ActionHistory extends Model {
  public id!: string;
  public item_id!: string;
  public item_name!: string;
  public company_prefix!: string;
  public action!: string;
  public from_location!: string;
  public to_location!: string;
  public performed_by!: string;
}

ActionHistory.init({
  id: { type: DataTypes.STRING(36), primaryKey: true },
  item_id: { type: DataTypes.STRING(36) },
  item_name: { type: DataTypes.STRING(100), allowNull: false },
  company_prefix: { type: DataTypes.STRING(10) },
  action: { type: DataTypes.ENUM('registered', 'sterilized', 'used', 'grouped', 'disbanded', 'forwarded', 'received', 'removed_from_inventory', 'marked_unsterilized', 'sterilization_completed', 'step_by_hand', 'step_washing', 'step_steam_sterilization', 'step_cooling', 'step_finished', 'forwarding_requested', 'rejected'), allowNull: false },
  from_location: { type: DataTypes.STRING(100) },
  to_location: { type: DataTypes.STRING(100) },
  performed_by: { type: DataTypes.STRING(36) },
  timestamp: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, { sequelize, tableName: 'action_history', underscored: true });

// Forwarding Request Model
export class ForwardingRequest extends Model {
  public id!: string;
  public group_id!: string;
  public from_location!: string;
  public to_location!: string;
  public status!: 'pending' | 'accepted' | 'rejected';
  public requested_by!: string;
  public processed_by!: string;
}

ForwardingRequest.init({
  id: { type: DataTypes.STRING(36), primaryKey: true },
  group_id: { type: DataTypes.STRING(36), allowNull: false },
  from_location: { type: DataTypes.STRING(100), allowNull: false },
  to_location: { type: DataTypes.STRING(100), allowNull: false },
  status: { type: DataTypes.ENUM('pending', 'accepted', 'rejected'), defaultValue: 'pending' },
  rejection_reason: { type: DataTypes.STRING(100) },
  requested_by: { type: DataTypes.STRING(36) },
  processed_by: { type: DataTypes.STRING(36) }
}, { sequelize, tableName: 'forwarding_requests', underscored: true });

// Associations
InstrumentGroup.hasMany(GroupItem, { foreignKey: 'group_id' });
GroupItem.belongsTo(InstrumentGroup, { foreignKey: 'group_id' });
MedicalItem.hasMany(GroupItem, { foreignKey: 'item_id' });
GroupItem.belongsTo(MedicalItem, { foreignKey: 'item_id' });

// Forwarding Request associations
ForwardingRequest.belongsTo(InstrumentGroup, { foreignKey: 'group_id' });
InstrumentGroup.hasMany(ForwardingRequest, { foreignKey: 'group_id' });

export { sequelize };