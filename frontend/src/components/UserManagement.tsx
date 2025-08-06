import React, { useState, useEffect } from 'react';
import { authAPI } from '../services/api';
import type { User } from '../services/api';

const UserManagement: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newRole, setNewRole] = useState<'admin' | 'msu' | 'storage' | 'surgery'>('msu');
  const [loading, setLoading] = useState(true);
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [editUsername, setEditUsername] = useState('');
  const [editRole, setEditRole] = useState<'admin' | 'msu' | 'storage' | 'surgery'>('msu');
  const [newPassword, setNewPassword] = useState('');

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const response = await authAPI.getUsers();
      setUsers(response.data);
    } catch (error) {
      console.error('Failed to load users:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newUsername.trim()) {
      alert('Please enter a username');
      return;
    }
    
    try {
      await authAPI.createUser(newUsername, newRole);
      setNewUsername('');
      setNewRole('msu');
      setShowCreateForm(false);
      loadUsers();
      alert('User created successfully');
    } catch (error: any) {
      console.error('Failed to create user:', error);
      alert(`Failed to create user: ${error.response?.data?.error || error.message}`);
    }
  };

  const handleUpdateUser = async (userId: string) => {
    if (!editUsername.trim()) {
      alert('Please enter a username');
      return;
    }
    
    try {
      // Update user details
      await authAPI.updateUser(userId, { username: editUsername, role: editRole });
      
      // Update password if provided
      if (newPassword.trim()) {
        await authAPI.setPassword(userId, newPassword);
      }
      
      setEditingUser(null);
      setNewPassword('');
      loadUsers();
      alert('User updated successfully');
    } catch (error: any) {
      console.error('Failed to update user:', error);
      alert(`Failed to update user: ${error.response?.data?.error || error.message}`);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (window.confirm('Are you sure you want to delete this user?')) {
      try {
        await authAPI.deleteUser(userId);
        loadUsers();
        alert('User deleted successfully');
      } catch (error: any) {
        console.error('Failed to delete user:', error);
        alert(`Failed to delete user: ${error.response?.data?.error || error.message}`);
      }
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'admin': return '#e74c3c';
      case 'msu': return '#3498db';
      case 'storage': return '#f39c12';
      case 'surgery': return '#27ae60';
      default: return '#95a5a6';
    }
  };

  if (loading) {
    return <div className="loading">Loading users...</div>;
  }

  return (
    <div className="user-management">
      <div className="management-header">
        <h2>User Management</h2>
        <button 
          onClick={() => setShowCreateForm(true)}
          className="create-user-btn"
        >
          + Create User
        </button>
      </div>

      {showCreateForm && (
        <div className="create-user-form">
          <h3>Create New User</h3>
          <form onSubmit={handleCreateUser}>
            <div className="form-group">
              <input
                type="text"
                placeholder="Username"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as any)}
              >
                <option value="msu">MSU Personnel</option>
                <option value="storage">Storage Personnel</option>
                <option value="surgery">Surgery Personnel</option>
                <option value="admin">Administrator</option>
              </select>
            </div>
            <div className="form-actions">
              <button type="submit" className="btn-green">Create</button>
              <button 
                type="button" 
                onClick={() => setShowCreateForm(false)}
                className="btn-red"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="users-list">
        {users.map(user => (
          <div key={user.id} className="user-card">
            {editingUser === user.id ? (
              <div className="edit-user-form">
                <input
                  type="text"
                  value={editUsername}
                  onChange={(e) => setEditUsername(e.target.value)}
                  placeholder="Username"
                />
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value as any)}
                >
                  <option value="msu">MSU Personnel</option>
                  <option value="storage">Storage Personnel</option>
                  <option value="surgery">Surgery Personnel</option>
                  <option value="admin">Administrator</option>
                </select>
                <input
                  type="text"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="New Password (leave empty to keep current)"
                />
                <div className="edit-actions">
                  <button onClick={() => handleUpdateUser(user.id)} className="btn-green">Save</button>
                  <button onClick={() => setEditingUser(null)} className="btn-red">Cancel</button>
                </div>
              </div>
            ) : (
              <>
                <div className="user-info">
                  <div className="username">{user.username}</div>
                  <div 
                    className="role"
                    style={{ color: getRoleColor(user.role) }}
                  >
                    {user.role.toUpperCase()}
                  </div>

                </div>
                <div className="user-actions">
                  <button
                    onClick={() => {
                      setEditingUser(user.id);
                      setEditUsername(user.username);
                      setEditRole(user.role);
                      setNewPassword('');
                    }}
                    className="btn-blue"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDeleteUser(user.id)}
                    className="btn-red"
                    disabled={user.role === 'admin'}
                  >
                    Delete
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      {users.length === 0 && (
        <div className="no-users">No users found</div>
      )}
    </div>
  );
};

export default UserManagement;