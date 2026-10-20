import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import * as api from '../api/client';
import { Project } from '../api/types';
import { StatusBadge } from '../components/StatusBadge';
import {
  Layers,
  Plus,
  FolderGit2,
  Calendar,
  ExternalLink,
  Search,
} from 'lucide-react';

export const Projects: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  const loadProjects = async () => {
    try {
      const data = await api.listProjects();
      setProjects(data);
    } catch (err) {
      console.error('Failed to load projects:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProjects();
  }, []);

  const filteredProjects = projects.filter((p) =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.description && p.description.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-800">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Projects & Repositories
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Manage application targets, uploaded source archives, and isolated test configurations
          </p>
        </div>

        <Link
          to="/projects/new"
          className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs sm:text-sm font-semibold py-2.5 px-4 rounded-xl flex items-center gap-2 transition-all shadow-lg shadow-indigo-600/25 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>New Project</span>
        </Link>
      </div>

      {/* Search Bar */}
      <div className="relative max-w-md">
        <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Filter projects by name or description..."
          className="w-full bg-slate-900/60 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
        />
      </div>

      {/* Grid of Projects */}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center text-slate-400 gap-3">
          <span className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">Fetching projects...</span>
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="py-16 text-center border border-dashed border-slate-800 rounded-2xl bg-slate-900/30 p-8">
          <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center mx-auto mb-4 text-slate-400">
            <Layers className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-white">No projects found</h3>
          <p className="text-slate-400 text-sm max-w-md mx-auto mt-1 mb-6">
            Get started by creating your first project and uploading a repository archive or testing against our fixture demo.
          </p>
          <Link
            to="/projects/new"
            className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm px-4 py-2.5 rounded-xl shadow-lg shadow-indigo-600/25 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Create First Project</span>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProjects.map((project) => (
            <Link
              key={project.id}
              to={`/projects/${project.id}`}
              className="group bg-slate-900/60 backdrop-blur-xl border border-slate-800/80 hover:border-indigo-500/50 rounded-2xl p-6 shadow-xl hover:shadow-indigo-500/10 transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 group-hover:bg-indigo-500 group-hover:text-white transition-all">
                    <FolderGit2 className="w-5 h-5" />
                  </div>
                  <StatusBadge status={project.status} size="sm" />
                </div>

                <h3 className="text-base font-bold text-white group-hover:text-indigo-300 transition-colors">
                  {project.name}
                </h3>
                <p className="text-xs text-slate-400 mt-1.5 line-clamp-2 leading-relaxed">
                  {project.description || 'No description provided'}
                </p>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-800/80 space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Framework</span>
                  <span className="font-mono text-slate-200">
                    {project.detectedFramework || 'Auto-detect'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Port</span>
                  <span className="font-mono text-slate-200">{project.port || 3000}</span>
                </div>
                <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    <span>{new Date(project.createdAt).toLocaleDateString()}</span>
                  </span>
                  <span className="text-indigo-400 group-hover:translate-x-0.5 transition-transform flex items-center gap-1 font-semibold">
                    <span>Manage</span>
                    <ExternalLink className="w-3 h-3" />
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};
