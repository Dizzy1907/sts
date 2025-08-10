import { DataTypes, Model } from 'sequelize';
import sequelize from './database';

// User Model
export class User extends Model {
  public id!: string;
  public username!: string;
  public password_hash!: string;
  public role!: 'head_admin' | 'admin' | 'msu' | 'storage' | 'surgery';
}

User.init({
  id: { type: DataTypes.STRING(36), primaryKey: true },
  username: { type: DataTypes.STRING(50), unique: true, allowNull: false },
  password_hash: { type: DataTypes.STRING(255) },
  role: { type: DataTypes.ENUM('head_admin', 'admin', 'msu', 'storage', 'surgery'), allowNull: false }
}, { sequelize, tableName: 'users', underscored: true });

// Medical Item Model
export class MedicalItem extends Model {
  public id!: string;
  public company_prefix!: string;
  public serial_number!: number;
  public item_name!: string;
  public sterilized!: boolean;
  public location!: string;
  public status?: string;
}

MedicalItem.init({
  id: { type: DataTypes.STRING(36), primaryKey: true },
  company_prefix: { type: DataTypes.STRING(10), allowNull: false },
  serial_number: { type: DataTypes.INTEGER, allowNull: false },
  item_name: { type: DataTypes.STRING(100), allowNull: false },
  sterilized: { type: DataTypes.BOOLEAN, defaultValue: false },
  location: { type: DataTypes.STRING(100), defaultValue: 'MSU' },
  status: { type: DataTypes.STRING(100), defaultValue: 'Not Sterilized' }
}, { 
  sequelize, 
  tableName: 'medical_items', 
  underscored: true,
  indexes: [
    { fields: ['location'] },
    { fields: ['created_at'] }
  ]
});

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
  action: { type: DataTypes.ENUM('registered', 'sterilized', 'used', 'grouped', 'disbanded', 'forwarded', 'received', 'removed_from_inventory', 'marked_unsterilized', 'sterilization_completed', 'step_by_hand', 'step_washing', 'step_steam_sterilization', 'step_cooling', 'step_finished', 'forwarding_requested', 'rejected', 'stored', 'removed_from_group', 'user_created', 'user_deleted'), allowNull: false },
  from_location: { type: DataTypes.STRING(100) },
  to_location: { type: DataTypes.STRING(100) },
  rejection_reason: { type: DataTypes.TEXT },
  performed_by: { type: DataTypes.STRING(36) },
  performed_by_username: { type: DataTypes.STRING(50) },
  performed_by_role: { type: DataTypes.STRING(20) },
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
  rejection_reason: { type: DataTypes.TEXT },
  requested_by: { type: DataTypes.STRING(36) },
  processed_by: { type: DataTypes.STRING(36) },
  processed_at: { type: DataTypes.DATE }
}, { sequelize, tableName: 'forwarding_requests', underscored: true });

// Storage Position Model
export class StoragePosition extends Model {
  public id!: string;
  public item_id!: string;
  public item_name!: string;
  public item_type!: 'Item' | 'Group';
  public position!: string;
  public stored_by!: string;
}

StoragePosition.init({
  id: { type: DataTypes.STRING(36), primaryKey: true },
  item_id: { type: DataTypes.STRING(36), allowNull: false },
  item_name: { type: DataTypes.STRING(100), allowNull: false },
  item_type: { type: DataTypes.ENUM('Item', 'Group'), allowNull: false },
  position: { type: DataTypes.STRING(10), allowNull: false },
  stored_by: { type: DataTypes.STRING(36), allowNull: false }
}, { sequelize, tableName: 'storage_positions', underscored: true });

// Associations
InstrumentGroup.hasMany(GroupItem, { foreignKey: 'group_id', as: 'GroupItems' });
GroupItem.belongsTo(InstrumentGroup, { foreignKey: 'group_id' });
MedicalItem.hasMany(GroupItem, { foreignKey: 'item_id' });
GroupItem.belongsTo(MedicalItem, { foreignKey: 'item_id' });

// Forwarding Request associations
ForwardingRequest.belongsTo(InstrumentGroup, { foreignKey: 'group_id' });
InstrumentGroup.hasMany(ForwardingRequest, { foreignKey: 'group_id' });

// Action History associations - no foreign key constraint to allow user deletion while preserving history
ActionHistory.belongsTo(User, { foreignKey: 'performed_by', constraints: false });
User.hasMany(ActionHistory, { foreignKey: 'performed_by', constraints: false });
ActionHistory.belongsTo(MedicalItem, { foreignKey: 'item_id', constraints: false });
MedicalItem.hasMany(ActionHistory, { foreignKey: 'item_id', constraints: false });

export { sequelize };