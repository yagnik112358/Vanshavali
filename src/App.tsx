/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  useReactFlow,
  getViewportForBounds,
  ConnectionLineType,
  MiniMap
} from '@xyflow/react';
import type { Node } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { toPng } from 'html-to-image';
import jsPDF from 'jspdf';

import { Person } from './types';
import { getPeople, savePerson, deletePerson, isSupabaseConnected, uploadPersonPhoto } from './lib/db';
import { buildFamilyTreeLayout } from './lib/layout';
import { FamilyMemberNode } from './components/FamilyMemberNode';
import { FamilyRelationEdge } from './components/FamilyRelationEdge';
import MemberProfileSheet from './components/MemberProfileSheet';
import MemberEditModal from './components/MemberEditModal';
import SupabaseGuidePanel from './components/SupabaseGuidePanel';
import EditLockModal from './components/EditLockModal';

import {
  Plus,
  Search,
  Users,
  Grid,
  Eye,
  RefreshCw,
  Minimize2,
  Bookmark,
  Lock,
  Unlock,
  Download,
  Moon,
  Sun
} from 'lucide-react';

const nodeTypes = {
  familyMember: FamilyMemberNode,
};

const edgeTypes = {
  familyRelation: FamilyRelationEdge,
};

type AppScreen = 'tree' | 'list' | 'profile' | 'edit' | 'db' | 'lock';
type ThemeMode = 'light' | 'dark';

const APP_HISTORY_STATE_KEY = 'familyTreeScreen';
const EXPORT_NODE_WIDTH = 280;
const EXPORT_NODE_HEIGHT = 150;
const EXPORT_PADDING = 240;

interface TreeExportButtonProps {
  isExporting: boolean;
  isDisabled: boolean;
  onExport: () => void;
  label?: string;
}

function TreeExportButton({ isExporting, isDisabled, onExport, label = 'Download PDF' }: TreeExportButtonProps) {
  return (
    <button
      onClick={onExport}
      disabled={isDisabled}
      className="tree-export-button bg-white disabled:opacity-45 disabled:cursor-not-allowed text-[var(--color-brand)] border border-[var(--color-brand-border)] px-3 py-2 rounded-full text-[11px] font-bold hover:bg-[var(--color-brand-light)] transition-all shrink-0 flex items-center justify-center gap-1 cursor-pointer shadow-md"
      title="Export open tree canvas as PDF"
    >
      <Download className="w-3.5 h-3.5" />
      <span>{isExporting ? 'Exporting...' : label}</span>
    </button>
  );
}

function getFallbackNodeBounds(nodes: Node[]) {
  const minX = Math.min(...nodes.map(node => node.position.x));
  const minY = Math.min(...nodes.map(node => node.position.y));
  const maxX = Math.max(...nodes.map(node => node.position.x + EXPORT_NODE_WIDTH));
  const maxY = Math.max(...nodes.map(node => node.position.y + EXPORT_NODE_HEIGHT));

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function getFamilyPdfFileName(centerPerson: Person | undefined): string {
  const baseName = centerPerson?.name?.trim() || 'Bharadwa';
  const safeName = baseName
    .replace(/[^\p{L}\p{N}_-]+/gu, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '') || 'Bharadwa';

  return `${safeName}_family.pdf`;
}

// Internal Workspace Dashboard (requires ReactFlowProvider)
function FamilyTreeWorkspace() {
  const { fitView, zoomIn, zoomOut, getNodesBounds } = useReactFlow();
  const treeCanvasRef = useRef<HTMLDivElement>(null);
  const activeScreenRef = useRef<AppScreen>('tree');
  const suppressNextHistoryPushRef = useRef(false);
  const appHistoryDepthRef = useRef(0);

  // Primary states
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'tree' | 'list'>('tree');
  const [searchQuery, setSearchQuery] = useState('');
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    return localStorage.getItem('family_tree_theme_mode_v1') === 'dark' ? 'dark' : 'light';
  });
  
  // Filtering & Focus parameters
  const [focusPersonId, setFocusPersonId] = useState<string | null>(null);
  const [pendingTreeFit, setPendingTreeFit] = useState(false);

  // Side drawers and editing sheet controllers
  const [selectedPersonForProfile, setSelectedPersonForProfile] = useState<Person | null>(null);
  const [editPerson, setEditPerson] = useState<Person | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [relationPreset, setRelationPreset] = useState<{
    type: 'child' | 'spouse' | 'parent';
    relativeId: string;
  } | null>(null);

  // Sync state
  const [cloudSynced, setCloudSynced] = useState(false);
  const [isDbOpen, setIsDbOpen] = useState(false);
  const [pendingEditPerson, setPendingEditPerson] = useState<Person | null>(null);

  // Edit Authorization States (default: LocalStorage, fallback Pin '1947')
  const [isUnlocked, setIsUnlocked] = useState<boolean>(() => {
    return localStorage.getItem('family_tree_is_unlocked_v1') === 'true';
  });
  const [passcode, setPasscode] = useState<string>(() => {
    return localStorage.getItem('family_tree_passcode_v1') || '1947';
  });
  const [isLockModalOpen, setIsLockModalOpen] = useState(false);

  const handleUnlock = (pin: string) => {
    if (pin === passcode) {
      setIsUnlocked(true);
      localStorage.setItem('family_tree_is_unlocked_v1', 'true');
      setIsLockModalOpen(false);
      if (pendingEditPerson) {
        setIsProfileOpen(false);
        setIsDbOpen(false);
        setEditPerson(pendingEditPerson);
        setRelationPreset(null);
        setIsEditOpen(true);
        setPendingEditPerson(null);
      }
      return true;
    }
    return false;
  };

  const handleLock = () => {
    setIsUnlocked(false);
    localStorage.setItem('family_tree_is_unlocked_v1', 'false');
    setPendingEditPerson(null);
    setIsLockModalOpen(false);
  };

  const handleUpdatePasscode = (newPin: string) => {
    setPasscode(newPin);
    localStorage.setItem('family_tree_passcode_v1', newPin);
  };

  const closeTopScreenState = useCallback(() => {
    const screen = activeScreenRef.current;

    if (screen === 'lock') {
      setIsLockModalOpen(false);
      setPendingEditPerson(null);
      return true;
    }

    if (screen === 'edit') {
      setIsEditOpen(false);
      setEditPerson(null);
      setRelationPreset(null);
      return true;
    }

    if (screen === 'profile') {
      setIsProfileOpen(false);
      setSelectedPersonForProfile(null);
      return true;
    }

    if (screen === 'db') {
      setIsDbOpen(false);
      return true;
    }

    if (screen === 'list') {
      setViewMode('tree');
      return true;
    }

    return false;
  }, []);

  const requestAppBack = useCallback(() => {
    if (appHistoryDepthRef.current > 0) {
      window.history.back();
      return;
    }

    closeTopScreenState();
  }, [closeTopScreenState]);

  const showTreeView = useCallback(() => {
    if (activeScreenRef.current === 'list' && appHistoryDepthRef.current > 0) {
      window.history.back();
      return;
    }

    setViewMode('tree');
  }, []);

  const showListView = useCallback(() => {
    setViewMode('list');
  }, []);

  const handleToggleTheme = () => {
    setThemeMode(current => (current === 'light' ? 'dark' : 'light'));
  };

  const handleExportPdf = async () => {
    if (!treeCanvasRef.current || loading || isExportingPdf || nodes.length === 0) return;

    setIsExportingPdf(true);
    try {
      if (viewMode !== 'tree') {
        setViewMode('tree');
        await new Promise(resolve => window.setTimeout(resolve, 250));
      }

      const canvasElement = treeCanvasRef.current;
      const viewportElement = canvasElement.querySelector('.react-flow__viewport') as HTMLElement | null;
      if (!viewportElement) {
        throw new Error('React Flow viewport was not ready for export.');
      }

      const measuredBounds = getNodesBounds(nodes.map(node => node.id));
      const bounds = measuredBounds.width > 0 && measuredBounds.height > 0
        ? measuredBounds
        : getFallbackNodeBounds(nodes);
      const paddedWidth = bounds.width + EXPORT_PADDING * 2;
      const paddedHeight = bounds.height + EXPORT_PADDING * 2;
      const exportWidth = Math.round(Math.min(Math.max(paddedWidth, 1600), 3200));
      const exportHeight = Math.round(Math.min(Math.max(paddedHeight, 1000), 3200));
      const exportViewport = getViewportForBounds(
        bounds,
        exportWidth,
        exportHeight,
        0.05,
        2,
        0.08,
      );

      const imageData = await toPng(viewportElement, {
        backgroundColor: themeMode === 'dark' ? '#1e1e1a' : '#fdfdfb',
        cacheBust: true,
        width: exportWidth,
        height: exportHeight,
        pixelRatio: 2,
        style: {
          width: `${exportWidth}px`,
          height: `${exportHeight}px`,
          transform: `translate(${exportViewport.x}px, ${exportViewport.y}px) scale(${exportViewport.zoom})`,
        },
      });

      const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 24;
      const availableWidth = pageWidth - margin * 2;
      const availableHeight = pageHeight - margin * 2;
      const imageRatio = exportWidth / exportHeight;
      let imageWidth = availableWidth;
      let imageHeight = imageWidth / imageRatio;

      if (imageHeight > availableHeight) {
        imageHeight = availableHeight;
        imageWidth = imageHeight * imageRatio;
      }

      pdf.addImage(
        imageData,
        'PNG',
        (pageWidth - imageWidth) / 2,
        (pageHeight - imageHeight) / 2,
        imageWidth,
        imageHeight,
      );
      const centerPerson = focusPersonId
        ? people.find(person => person.id === focusPersonId)
        : undefined;
      pdf.save(getFamilyPdfFileName(centerPerson));
    } catch (err) {
      console.error('Error exporting family tree PDF:', err);
      alert('Failed to export PDF. Try again after photos finish loading.');
    } finally {
      setIsExportingPdf(false);
    }
  };

  // Fetch people from database
  const loadFamilyData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getPeople();
      setPeople(data);
      setCloudSynced(isSupabaseConnected());
      
      // Select first grandparent as default focus if no focus exists
      if (data.length > 0 && !focusPersonId) {
        // Look for someone with no parents (Family Elder / વડીલ)
        const rootOptions = data.filter(p => !p.fatherid && !p.motherid);
        if (rootOptions.length > 0) {
          setFocusPersonId(rootOptions[0].id);
        } else {
          setFocusPersonId(data[0].id);
        }
      }
    } catch (err) {
      console.error('Error fetching family data:', err);
    } finally {
      setLoading(false);
    }
  }, [focusPersonId]);

  useEffect(() => {
    loadFamilyData();
  }, []);

  // Sync to database
  const handleSavePerson = async (savedPerson: Person) => {
    if (!isUnlocked) {
      setIsLockModalOpen(true);
      return;
    }
    try {
      const result = await savePerson(savedPerson);
      
      // Reload lists
      const data = await getPeople();
      setPeople(data);

      // Keep focus updated
      if (!focusPersonId) {
        setFocusPersonId(result.id);
      }

      // Close modal
      setIsEditOpen(false);
      setEditPerson(null);
      setRelationPreset(null);
      if (activeScreenRef.current === 'edit' && appHistoryDepthRef.current > 0) {
        window.history.back();
      }

      // If viewing active sheet, update data
      if (selectedPersonForProfile && selectedPersonForProfile.id === result.id) {
        setSelectedPersonForProfile(result);
      }
    } catch (err) {
      console.error('Error saving family member:', err);
      alert('Failed to save profile. Refer to DB Setup SQL block if columns are missing.');
    }
  };

  const handleDeletePerson = async (id: string) => {
    if (!isUnlocked) {
      setIsLockModalOpen(true);
      return;
    }
    try {
      await deletePerson(id);
      
      // Clear focus if we deleted the focused person
      if (focusPersonId === id) {
        setFocusPersonId(null);
      }
      if (selectedPersonForProfile?.id === id) {
        setIsProfileOpen(false);
      }
      
      // Reload
      const data = await getPeople();
      setPeople(data);

      setIsEditOpen(false);
      setEditPerson(null);
      if (activeScreenRef.current === 'edit' && appHistoryDepthRef.current > 0) {
        window.history.back();
      }
    } catch (err) {
      console.error('Error deleting person:', err);
    }
  };

  const handleProfilePhotoUpload = async (person: Person, file: File): Promise<void> => {
    if (!isUnlocked) {
      setIsLockModalOpen(true);
      throw new Error('Unlock Editor Mode before changing photos.');
    }

    const photoUrl = await uploadPersonPhoto(file, person.id);
    const updatedPerson = { ...person, photourl: photoUrl };
    const savedPerson = await savePerson(updatedPerson);
    const data = await getPeople();

    setPeople(data);
    setSelectedPersonForProfile(savedPerson);
  };

  // Profile triggers
  const triggerViewProfile = (person: Person) => {
    setIsEditOpen(false);
    setIsDbOpen(false);
    setSelectedPersonForProfile(person);
    setIsProfileOpen(true);
  };

  const triggerEditMember = (person: Person) => {
    if (!isUnlocked) {
      setPendingEditPerson(person);
      setIsLockModalOpen(true);
      return;
    }
    setIsProfileOpen(false);
    setIsDbOpen(false);
    setIsLockModalOpen(false);
    setPendingEditPerson(null);
    setEditPerson(person);
    setRelationPreset(null);
    setIsEditOpen(true);
  };

  const triggerAddMember = () => {
    if (!isUnlocked) {
      setIsLockModalOpen(true);
      return;
    }
    setIsProfileOpen(false);
    setIsDbOpen(false);
    setEditPerson(null); // Null means new creation
    setRelationPreset(null);
    setIsEditOpen(true);
  };

  // Quick relation building shortcuts
  const addSpouseQuick = (relativeId: string) => {
    if (!isUnlocked) {
      setIsLockModalOpen(true);
      return;
    }
    setIsProfileOpen(false);
    setIsDbOpen(false);
    setEditPerson(null);
    setRelationPreset({ type: 'spouse', relativeId });
    setIsEditOpen(true);
  };

  const addChildQuick = (relativeId: string) => {
    if (!isUnlocked) {
      setIsLockModalOpen(true);
      return;
    }
    setIsProfileOpen(false);
    setIsDbOpen(false);
    setEditPerson(null);
    setRelationPreset({ type: 'child', relativeId });
    setIsEditOpen(true);
  };

  // Focus and Zoom centers
  const handleFocusSelect = (id: string | null) => {
    setFocusPersonId(id);
    setPendingTreeFit(true);
  };

  // Search Live Filters: both for list search and highlighting in tree
  const filteredPeople = useMemo(() => {
    if (!searchQuery.trim()) return people;
    const query = searchQuery.toLowerCase().trim();
    return people.filter(p => 
      p.name.toLowerCase().includes(query) ||
      (p.notes && p.notes.toLowerCase().includes(query)) ||
      (p.occupation && p.occupation.toLowerCase().includes(query)) ||
      (p.birthPlace && p.birthPlace.toLowerCase().includes(query))
    );
  }, [people, searchQuery]);

  // Construct coordinates for drawing
  const { nodes, edges } = useMemo(() => {
    const layout = buildFamilyTreeLayout(people, focusPersonId);
    
    // Supplement events/handlers metadata to the laying arrays
    const finalNodes = layout.nodes.map(n => ({
      ...n,
      data: {
        ...n.data,
        onViewProfile: triggerViewProfile,
        onEditMember: triggerEditMember,
        onFocusSelect: handleFocusSelect,
      }
    }));

    return { nodes: finalNodes, edges: layout.edges };
  }, [people, focusPersonId]);

  const activeScreen = useMemo<AppScreen>(() => {
    if (isLockModalOpen) return 'lock';
    if (isEditOpen) return 'edit';
    if (isProfileOpen) return 'profile';
    if (isDbOpen) return 'db';
    if (viewMode === 'list') return 'list';
    return 'tree';
  }, [isLockModalOpen, isEditOpen, isProfileOpen, isDbOpen, viewMode]);
  activeScreenRef.current = activeScreen;

  useEffect(() => {
    document.documentElement.dataset.theme = themeMode;
    document.documentElement.style.colorScheme = themeMode;
    localStorage.setItem('family_tree_theme_mode_v1', themeMode);
  }, [themeMode]);

  useEffect(() => {
    activeScreenRef.current = activeScreen;
  }, [activeScreen]);

  useEffect(() => {
    const handlePopState = () => {
      if (appHistoryDepthRef.current > 0) {
        appHistoryDepthRef.current -= 1;
      }

      if (activeScreenRef.current !== 'tree') {
        suppressNextHistoryPushRef.current = true;
        closeTopScreenState();
      }
    };

    const initialState = window.history.state;
    if (!initialState || initialState[APP_HISTORY_STATE_KEY] !== 'tree') {
      window.history.replaceState(
        { ...(initialState || {}), [APP_HISTORY_STATE_KEY]: 'tree' },
        '',
        window.location.href,
      );
    }

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [closeTopScreenState]);

  useEffect(() => {
    if (suppressNextHistoryPushRef.current) {
      suppressNextHistoryPushRef.current = false;
      return;
    }

    if (activeScreen === 'tree') return;

    const currentScreen = window.history.state?.[APP_HISTORY_STATE_KEY];
    if (currentScreen === activeScreen) return;

    window.history.pushState(
      { ...(window.history.state || {}), [APP_HISTORY_STATE_KEY]: activeScreen },
      '',
      window.location.href,
    );
    appHistoryDepthRef.current += 1;
  }, [activeScreen]);

  useEffect(() => {
    if (!pendingTreeFit || viewMode !== 'tree' || loading) return;

    const frame = window.requestAnimationFrame(() => {
      window.setTimeout(() => {
        fitView({ duration: 800, padding: 0.25 });
        setPendingTreeFit(false);
      }, 50);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [pendingTreeFit, viewMode, loading, focusPersonId, nodes.length, edges.length, fitView]);

  // General statistics computation
  const stats = useMemo(() => {
    if (people.length === 0) return { total: 0, males: 0, females: 0, avgAge: 0 };
    const total = people.length;
    const males = people.filter(p => p.gender === 'male').length;
    const females = people.filter(p => p.gender === 'female').length;
    const others = people.filter(p => p.gender === 'other').length;

    // Calculate age average dynamically
    let calculatedCount = 0;
    let sumAge = 0;
    people.forEach(p => {
      if (p.dob) {
        try {
          const dob = new Date(p.dob);
          const end = p.dod ? new Date(p.dod) : new Date();
          let age = end.getFullYear() - dob.getFullYear();
          if (!isNaN(age)) {
            sumAge += age;
            calculatedCount++;
          }
        } catch {}
      }
    });

    const avgAge = calculatedCount > 0 ? Math.round(sumAge / calculatedCount) : 0;

    return { total, males, females, others, avgAge };
  }, [people]);

  return (
    <div data-theme={themeMode} className="app-shell h-screen bg-[#f5f5f0] text-stone-900 flex flex-col font-sans antialiased overflow-hidden">
      
      {/* 1. Header Toolbar */}
      <header className="bg-white/70 backdrop-blur-md border-b border-[var(--color-brand-border)] h-16 shrink-0 flex items-center justify-between px-3 sm:px-8 shadow-xs z-10">
        
        {/* Left App Brand */}
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="w-8 h-8 rounded-full bg-[var(--color-brand)] flex items-center justify-center text-white shadow-xs shrink-0">
            <Users className="w-4 h-4" />
          </div>
          <div className="hidden min-[480px]:block leading-none">
            <h1 className="text-sm font-serif font-black tracking-tight text-[var(--color-brand)] leading-none flex items-center gap-1.5">
              Vanshavali
            </h1>
            <p className="text-[8px] text-[var(--color-brand-muted)] font-black tracking-widest uppercase mt-0.5">
              Family
            </p>
          </div>
        </div>

        {/* Global Toolbar Filters */}
        <div className="flex items-center gap-1 sm:gap-2.5 md:gap-4 select-none">
          {/* Quick Search */}
          <div className="relative hidden md:block w-64">
            <Search className="w-3.5 h-3.5 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search family name..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-8 py-1.5 bg-white border border-[var(--color-brand-border)] rounded-full text-xs font-semibold focus:outline-hidden focus:ring-2 focus:ring-[var(--color-brand)]/20 transition-all text-stone-900"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700 text-xs font-bold leading-none cursor-pointer"
              >
                ✕
              </button>
            )}

            {/* Realtime Search Autocomplete results (Dropdown UI) */}
            {searchQuery && (
              <div className="absolute top-full left-0 right-0 mt-1.5 bg-white border border-[var(--color-brand-border)] rounded-2xl shadow-xl max-h-64 overflow-y-auto z-50 p-2 space-y-1">
                {filteredPeople.length === 0 ? (
                  <p className="text-stone-400 text-center py-3 text-xs">No matching family member</p>
                ) : (
                  filteredPeople.map(p => (
                    <button
                      key={p.id}
                      onClick={() => {
                        handleFocusSelect(p.id);
                        setSearchQuery('');
                      }}
                      className="w-full text-left px-3 py-1.5 rounded-xl hover:bg-[var(--color-brand-light)] transition-colors flex items-center gap-2 cursor-pointer"
                    >
                      {p.photourl ? (
                        <img src={p.photourl} className="w-6 h-6 rounded-full object-cover border border-[var(--color-brand-border)] shrink-0" referrerPolicy="no-referrer" />
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-[#f5f5f0] border border-[var(--color-brand-border)] text-[var(--color-brand)] font-serif font-black text-[9px] flex items-center justify-center shrink-0">
                          {p.name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase() || '?'}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-xs font-serif font-bold text-stone-850 truncate leading-tight">{p.name}</p>
                        {p.birthPlace && (
                          <p className="text-[9px] text-stone-400 truncate leading-none mt-0.5">{p.birthPlace}</p>
                        )}
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* View Toggles (Graph vs Listing Table) */}
          <div className="bg-[#f5f5f0] p-0.5 sm:p-1 rounded-full border border-[var(--color-brand-border)] flex items-center gap-0.5">
            <button
              onClick={showTreeView}
              className={`flex items-center gap-1 px-2 py-1 sm:px-3 sm:py-1.5 rounded-full text-[11px] sm:text-xs font-bold tracking-tight cursor-pointer transition-all ${
                viewMode === 'tree'
                  ? 'bg-white text-[var(--color-brand)] shadow-xs'
                  : 'text-stone-550 hover:text-stone-800'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Tree View</span>
              <span className="sm:hidden text-[10px]">Tree</span>
            </button>
            <button
              onClick={showListView}
              className={`flex items-center gap-1 px-2 py-1 sm:px-3 sm:py-1.5 rounded-full text-[11px] sm:text-xs font-bold tracking-tight cursor-pointer transition-all ${
                viewMode === 'list'
                  ? 'bg-white text-[var(--color-brand)] shadow-xs'
                  : 'text-stone-550 hover:text-stone-800'
              }`}
            >
              <Grid className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Member List ({people.length})</span>
              <span className="sm:hidden text-[10px]">List ({people.length})</span>
            </button>
          </div>

          <button
            onClick={handleToggleTheme}
            className="bg-white text-[var(--color-brand)] border border-[var(--color-brand-border)] px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-full text-[11px] sm:text-xs font-bold hover:bg-[var(--color-brand-light)] transition-all shrink-0 flex items-center justify-center gap-1 cursor-pointer"
            title={`Switch to ${themeMode === 'light' ? 'dark' : 'light'} mode`}
          >
            {themeMode === 'light' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            <span className="hidden lg:inline">{themeMode === 'light' ? 'Light' : 'Dark'}</span>
          </button>

          {/* Lock/Unlock Authorization Badge Control */}
          <button
            onClick={() => setIsLockModalOpen(true)}
            className={`editor-mode-button ${isUnlocked ? 'editor-mode-unlocked' : 'editor-mode-locked'} flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-bold border transition-all cursor-pointer ${
              isUnlocked
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100/70'
                : 'bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100/70'
            }`}
            title="Turn edit mode on or off"
          >
            {isUnlocked ? (
              <>
                <Unlock className="w-3.5 h-3.5 text-emerald-600" />
                <span className="hidden sm:inline">Editor Mode (ખુલ્લું)</span>
              </>
            ) : (
              <>
                <Lock className="w-3.5 h-3.5 text-amber-600" />
                <span className="hidden sm:inline">View Only (લૉક)</span>
              </>
            )}
          </button>

          {/* Main action add button */}
          <button
            onClick={triggerAddMember}
            className="bg-[var(--color-brand)] hover:bg-[var(--color-brand-dark)] text-white px-2.5 py-1.5 sm:px-4 sm:py-2 rounded-full text-[11px] sm:text-xs font-medium hover:scale-102 active:scale-98 shadow-xs cursor-pointer transition-all shrink-0 flex items-center justify-center gap-0.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Add Member</span>
            <span className="sm:hidden">Add</span>
          </button>
        </div>
      </header>

      {/* Mobile search bar (only visible under md screen width) */}
      <div className="md:hidden bg-white border-b border-slate-100 p-3 shrink-0 flex flex-col gap-2 relative z-50">
        <div className="relative w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search family name..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-hidden text-slate-900"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-450 hover:text-slate-650 font-bold"
            >
              ✕
            </button>
          )}
        </div>

        {/* Realtime Autocomplete list for Mobile search */}
        {searchQuery && (
          <div className="absolute top-full left-0 right-0 mx-3 bg-white border border-stone-200 rounded-2xl shadow-xl max-h-60 overflow-y-auto z-50 p-2 space-y-1 mt-1 font-sans">
            {filteredPeople.length === 0 ? (
              <p className="text-stone-400 text-center py-4 text-xs">No options match your query</p>
            ) : (
              filteredPeople.map(p => (
                <button
                  key={p.id}
                  onClick={() => {
                    handleFocusSelect(p.id);
                    setSearchQuery('');
                  }}
                  className="w-full text-left px-3 py-2 rounded-xl hover:bg-[var(--color-brand-light)] transition-colors flex items-center gap-2.5 cursor-pointer animate-fade-in"
                >
                  {p.photourl ? (
                    <img src={p.photourl} className="w-7 h-7 rounded-full object-cover border border-[#d1d1cc] shrink-0" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-[#f5f5f0] border border-stone-200 text-[var(--color-brand)] font-serif font-black text-xs flex items-center justify-center shrink-0">
                      {p.name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase() || '?'}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-xs font-serif font-black italic text-[var(--color-brand)] truncate leading-none">{p.name}</p>
                    <p className="text-[10px] text-stone-450 truncate mt-1">{p.birthPlace || 'Family member'}</p>
                  </div>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* 2. Main Space Container */}
      <main className="flex-1 relative flex overflow-hidden">
        
        {loading ? (
          <div className="absolute inset-0 bg-slate-50/50 flex flex-col items-center justify-center z-10 gap-3">
            <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin" />
            <p className="text-xs text-slate-400 font-bold tracking-wide uppercase">Reading Family Records...</p>
          </div>
        ) : null}

        {/* Alternate Screen 1: The Interactive Graph Diagram */}
        {viewMode === 'tree' ? (
            <div className="flex-1 relative h-full w-full bg-[#fdfdfb]">
            
            {/* Control HUD Panel in Upper Corner */}
            <div className="absolute top-4 right-4 z-10 bg-white/90 backdrop-blur-md rounded-2xl shadow-md border border-[var(--color-brand-border)] p-4 w-[280px] hidden sm:block space-y-4">
              <div className="border-b border-[var(--color-brand-light)] pb-2">
                <span className="text-[10px] font-extrabold text-[var(--color-brand)] uppercase tracking-wider font-serif italic">Tree Settings</span>
              </div>
 
              {/* Focus Person selector */}
              <div className="space-y-1">
                <label className="text-[9px] font-extrabold text-stone-500 uppercase tracking-widest">Center Person</label>
                <select
                   value={focusPersonId || ''}
                  onChange={e => handleFocusSelect(e.target.value || null)}
                  className="w-full py-2 px-2.5 rounded-xl border border-[var(--color-brand-border)] bg-[#fafaf7] text-stone-800 text-xs font-semibold focus:outline-hidden focus:ring-1 focus:ring-[var(--color-brand)]"
                >
                  <option value="">-- Full Family Tree --</option>
                  {people.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
 
              {/* Simple Stats Summary */}
              <div className="bg-[#fafaf7] rounded-xl p-3 border border-[var(--color-brand-border)] flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-serif font-bold text-[var(--color-brand)] leading-tight">Family Count</p>
                  <p className="text-[9px] text-[#8E8E8A] mt-0.5 leading-none">
                    {stats.males} Males • {stats.females} Females
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-xl font-serif font-black text-[var(--color-brand)] leading-none">
                    {people.length}
                  </span>
                  <p className="text-[8px] text-[var(--color-brand-muted)] font-black uppercase leading-normal">People</p>
                </div>
              </div>

              <TreeExportButton
                isExporting={isExportingPdf}
                isDisabled={loading || isExportingPdf}
                onExport={handleExportPdf}
              />
            </div>
 
            {/* Micro HUD for mobile (floating at top-center/top-left) */}
            <div className="absolute top-2 left-2 z-10 flex gap-1.5 flex-wrap sm:hidden max-w-[calc(100vw-24px)] shrink-0">
              <div className="bg-white/95 backdrop-blur-md rounded-xl shadow-md border border-[var(--color-brand-border)] py-1.5 px-3 flex items-center gap-2">
                <span className="text-[10px] font-bold text-[var(--color-brand)] font-serif italic">Center:</span>
                <select
                  value={focusPersonId || ''}
                  onChange={e => handleFocusSelect(e.target.value || null)}
                  className="bg-transparent border-none text-stone-800 text-[11px] font-extrabold py-0.5 focus:outline-hidden"
                >
                  <option value="">Full Tree</option>
                  {people.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <TreeExportButton
                isExporting={isExportingPdf}
                isDisabled={loading || isExportingPdf}
                onExport={handleExportPdf}
              />
            </div>
 
            {/* Quick action buttons block relative to focus details - Artistic Flair styled */}
            {focusPersonId && (
              <div className="selected-actions-panel absolute bottom-4 left-1/2 -translate-x-1/2 sm:translate-x-0 sm:left-4 z-25 bg-[var(--color-brand)] shadow-xl border border-[var(--color-brand-dark)] rounded-xl sm:rounded-full px-3.5 py-2 sm:px-4.5 sm:py-2 text-white flex flex-col sm:flex-row items-center gap-2 sm:gap-4 text-xs font-bold ring-4 ring-white/10 max-w-[94vw] w-max select-none">
                <span className="text-white font-serif italic text-[11px] sm:text-xs truncate max-w-[200px] sm:max-w-xs block leading-none">
                  Selected: {people.find(p => p.id === focusPersonId)?.name}
                </span>
                <div className="h-px w-full bg-[var(--color-brand-dark)] sm:h-4 sm:w-px shrink-0" />
                <div className="flex items-center gap-3 sm:gap-4">
                  <button
                    onClick={() => addSpouseQuick(focusPersonId)}
                    className="hover:scale-105 active:scale-95 text-[#f5f5f0] flex items-center gap-1 transition-transform cursor-pointer text-[11px] sm:text-xs whitespace-nowrap shrink-0"
                    title="Add spouse for selected person"
                  >
                    <Plus className="w-3.5 h-3.5 text-white" /> Spouse
                  </button>
                  <button
                    onClick={() => addChildQuick(focusPersonId)}
                    className="hover:scale-105 active:scale-95 text-[#fafaf7] flex items-center gap-1 transition-transform cursor-pointer text-[11px] sm:text-xs whitespace-nowrap shrink-0"
                    title="Insert Child of Focus Person"
                  >
                    <Plus className="w-3.5 h-3.5 text-white" /> Child
                  </button>
                  <button
                    onClick={() => handleFocusSelect(null)}
                    className="hover:text-stone-200 text-stone-300 text-[11px] sm:text-xs leading-none underline whitespace-nowrap shrink-0 cursor-pointer font-serif italic"
                  >
                    Reset Center
                  </button>
                </div>
              </div>
            )}
 
            {/* Custom UI Touch navigation zooming (floating lower right) */}
            <div className="absolute bottom-4 right-4 z-10 flex flex-col gap-1.5 hidden md:flex">
              <button 
                onClick={() => zoomIn()} 
                className="w-10 h-10 bg-white hover:bg-[var(--color-brand-light)] text-[var(--color-brand)] rounded-full shadow-md border border-[var(--color-brand-border)] flex items-center justify-center font-bold active:scale-95 transition-all text-xs cursor-pointer"
                title="Zoom In"
              >
                ＋
              </button>
              <button 
                onClick={() => zoomOut()} 
                className="w-10 h-10 bg-white hover:bg-[var(--color-brand-light)] text-[var(--color-brand)] rounded-full shadow-md border border-[var(--color-brand-border)] flex items-center justify-center font-bold active:scale-95 transition-all text-xs cursor-pointer"
                title="Zoom Out"
              >
                －
              </button>
              <button 
                onClick={() => fitView({ duration: 500 })} 
                className="w-10 h-10 bg-white hover:bg-[var(--color-brand-light)] text-[var(--color-brand)] rounded-full shadow-md border border-[var(--color-brand-border)] flex items-center justify-center font-bold active:scale-95 transition-all text-xs cursor-pointer"
                title="Fit View"
              >
                <Minimize2 className="w-4 h-4 text-[var(--color-brand)]" />
              </button>
            </div>

            {/* React Flow Core Drawing Board */}
            <div ref={treeCanvasRef} className="absolute inset-0 bg-[#fdfdfb]">
              <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                connectionLineType={ConnectionLineType.SmoothStep}
                fitView
                minZoom={0.1}
                maxZoom={1.5}
                proOptions={{ hideAttribution: true }}
              >
                <Background color="#5A5A40" gap={24} size={1.2} style={{ opacity: 0.15 }} />
                
                <Controls showInteractive={false} className="sm:hidden" />
                
                <MiniMap 
                  nodeStrokeColor={(n) => '#e2e8f0'} 
                  nodeColor={(n) => {
                    const p = (n.data as any)?.person as Person;
                    if (p?.gender === 'female') return '#f3efec';
                    if (p?.gender === 'male') return '#edf0ec';
                    return '#f5f5f0';
                  }}
                  className="hidden sm:block shadow-lg border border-[var(--color-brand-border)] rounded-2xl overflow-hidden bg-white/85" 
                />
              </ReactFlow>
            </div>
          </div>
        ) : (
          
          /* Alternate Screen 2: Member Directory Table / List View */
          <div className="flex-1 bg-[#fdfdfb] flex flex-col h-full overflow-hidden">
            
            {/* Quick Stats Panel Header inside List Directory */}
            <section className="bg-[#f5f5f0] border-b border-[var(--color-brand-border)] p-4 shrink-0 grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-white border border-[var(--color-brand-border)] rounded-2xl p-3 shadow-xs">
                <span className="text-[9px] font-extrabold text-[var(--color-brand-muted)] uppercase tracking-wider block">Total Members</span>
                <span className="text-lg font-serif font-black italic text-[var(--color-brand)] leading-none">{stats.total} family members</span>
              </div>
              <div className="bg-white border border-[var(--color-brand-border)] rounded-2xl p-3 shadow-xs">
                <span className="text-[9px] font-extrabold text-[var(--color-brand-muted)] uppercase tracking-wider block">Average Age</span>
                <span className="text-lg font-serif font-black italic text-[var(--color-brand)] leading-none">{stats.avgAge} years</span>
              </div>
              <div className="bg-white border border-[var(--color-brand-border)] rounded-2xl p-3 shadow-xs">
                <span className="text-[9px] font-extrabold text-[var(--color-brand-muted)] uppercase tracking-wider block">Women</span>
                <span className="text-lg font-serif font-black italic text-[var(--color-brand)] leading-none">{stats.females} members</span>
              </div>
              <div className="bg-white border border-[var(--color-brand-border)] rounded-2xl p-3 shadow-xs">
                <span className="text-[9px] font-extrabold text-[var(--color-brand-muted)] uppercase tracking-wider block">Men</span>
                <span className="text-lg font-serif font-black italic text-[var(--color-brand)] leading-none">{stats.males} members</span>
              </div>
            </section>

            {/* List Body grid scroll area */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-[#fafaf7]">
              {filteredPeople.length === 0 ? (
                <div className="py-20 text-center space-y-3 font-serif">
                  <Bookmark className="w-12 h-12 text-stone-300 mx-auto" />
                  <h3 className="text-base font-black italic text-[var(--color-brand)]">No members found</h3>
                  <p className="text-xs text-stone-400 font-sans">Check spelling, search another village, or add a family member.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {filteredPeople.map(p => {
                    const initials = p.name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase() || '?';
                    const genderColor = p.gender === 'male' ? 'border-l-stone-400' : (p.gender === 'female' ? 'border-l-[var(--color-brand)]' : 'border-l-amber-600');
                    return (
                      <div 
                        key={p.id} 
                        className={`bg-white rounded-2xl shadow-xs border border-[var(--color-brand-border)] border-l-4 ${genderColor} p-4 flex flex-col justify-between transition-all hover:shadow-md hover:border-stone-300`}
                      >
                        <div className="space-y-3">
                          <div className="flex items-center gap-3">
                            {p.photourl ? (
                              <img 
                                src={p.photourl} 
                                alt={p.name} 
                                className="w-10 h-10 rounded-full object-cover bg-stone-100 border border-[var(--color-brand-border)] flex-shrink-0"
                                referrerPolicy="no-referrer"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = 'none';
                                }}
                              />
                            ) : (
                              <div className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-serif font-black bg-[#f5f5f0] border border-[var(--color-brand-border)] text-[var(--color-brand)] flex-shrink-0">
                                {initials}
                              </div>
                            )}

                            <div className="min-w-0">
                              <h3 className="text-sm font-serif font-black italic text-[var(--color-brand)] truncate leading-snug">{p.name}</h3>
                              <p className="text-[10px] text-stone-400 font-semibold leading-none mt-0.5">
                                {p.dob ? p.dob.split('-')[0] : 'N/A birth'}
                              </p>
                            </div>
                          </div>

                          {/* Biographical snippet */}
                          <div className="space-y-1 text-[11px] leading-relaxed">
                            {p.occupation && (
                              <p className="text-stone-600 font-semibold truncate flex items-center gap-1">
                                <span className="text-stone-400 font-normal">Work:</span> {p.occupation}
                              </p>
                            )}
                            {p.birthPlace && (
                              <p className="text-stone-600 truncate">
                                <span className="text-stone-400 font-normal">Birth Place:</span> {p.birthPlace}
                              </p>
                            )}
                            {p.notes && (
                              <p className="text-stone-550 italic font-serif font-normal line-clamp-2 mt-1">
                                "{p.notes}"
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Interactive actions for each directory member */}
                        <div className="border-t border-[#f5f5f0] mt-4 pt-3 flex items-center justify-between">
                          <button
                            onClick={() => {
                              showTreeView();
                              handleFocusSelect(p.id);
                            }}
                            className="text-[10px] text-[var(--color-brand)] hover:underline flex items-center gap-0.5 font-serif font-bold italic cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" /> Show in Tree
                          </button>

                          <div className="flex gap-1.5">
                            <button
                              onClick={() => triggerEditMember(p)}
                              className="text-[9px] text-stone-500 hover:text-stone-905 font-extrabold hover:bg-stone-50 border border-stone-200 rounded-full px-2 py-0.5 cursor-pointer transition-colors"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => triggerViewProfile(p)}
                              className="text-[9px] text-[var(--color-brand)] font-extrabold bg-white hover:bg-[var(--color-brand-light)] border border-[var(--color-brand-border)] rounded-full px-2.5 py-0.5 cursor-pointer transition-colors"
                            >
                              Details
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 3. Database Guide slide-down console modal */}
        <SupabaseGuidePanel
          isOpen={isDbOpen}
          onClose={requestAppBack}
        />

        {/* 4. Profiles view sheet side dialog */}
        <MemberProfileSheet
          isOpen={isProfileOpen}
          person={selectedPersonForProfile}
          onClose={requestAppBack}
          allPeople={people}
          onFocusMember={(id) => {
            handleFocusSelect(id);
            const found = people.find(p => p.id === id);
            if (found) {
              setSelectedPersonForProfile(found);
            }
          }}
          onEditMember={(p) => {
            setIsProfileOpen(false);
            triggerEditMember(p);
          }}
          onUploadPhoto={handleProfilePhotoUpload}
          canEdit={isUnlocked}
          onRequireUnlock={() => setIsLockModalOpen(true)}
        />

        {/* 5. Members database insertion / update modal dialog */}
        <MemberEditModal
          isOpen={isEditOpen}
          person={editPerson}
          onClose={requestAppBack}
          onSave={handleSavePerson}
          onDelete={handleDeletePerson}
          allPeople={people}
          relationPreset={relationPreset}
        />

        {/* 6. Security Pin/Passcode Lock Modal */}
        <EditLockModal
          isOpen={isLockModalOpen}
          onClose={requestAppBack}
          isUnlocked={isUnlocked}
          onUnlock={handleUnlock}
          onLock={handleLock}
          onUpdatePasscode={handleUpdatePasscode}
        />
      </main>
    </div>
  );
}

// Wrap inside ReactFlowProvider to enable fitView zoom hooks inside internal panels
export default function App() {
  return (
    <ReactFlowProvider>
      <FamilyTreeWorkspace />
    </ReactFlowProvider>
  );
}
