'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Copy, Download, RefreshCw } from 'lucide-react';

export default function Home() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [ampHtml, setAmpHtml] = useState('');
  const [originalHtml, setOriginalHtml] = useState('');
  const [validation, setValidation] = useState({ status: 'UNKNOWN', errors: [] });
  const [logs, setLogs] = useState([]);
  const [activeTab, setActiveTab] = useState('preview');
  const [copied, setCopied] = useState(false);
  const [options, setOptions] = useState({
    timeout: 35000,
    stripComments: true
  });

  const [originalSize, setOriginalSize] = useState(0);
  const [ampSize, setAmpSize] = useState(0);
  const [detectedAnalytics, setDetectedAnalytics] = useState(null);

  const logEndRef = useRef(null);

  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  const addLog = (message, type = 'info') => {
    setLogs(prev => [...prev, { message, type, time: new Date().toLocaleTimeString() }]);
  };

  const handleConvert = async (e) => {
    e.preventDefault();
    if (!url) return;

    setLoading(true);
    setLogs([]);
    setAmpHtml('');
    setOriginalHtml('');
    setOriginalSize(0);
    setAmpSize(0);
    setDetectedAnalytics(null);
    setValidation({ status: 'UNKNOWN', errors: [] });
    addLog(`Initiating AMP conversion for: ${url}`, 'info');

    try {
      const response = await fetch('/api/convert', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url, options }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Server returned an error');
      }

      if (data.logs && Array.isArray(data.logs)) {
        data.logs.forEach(logLine => {
          if (logLine.toLowerCase().includes('error')) {
            addLog(logLine, 'error');
          } else if (logLine.toLowerCase().includes('warning')) {
            addLog(logLine, 'warning');
          } else {
            addLog(logLine, 'success');
          }
        });
      }

      setAmpHtml(data.ampHtml);
      setOriginalHtml(data.originalHtml);
      setValidation(data.validation);
      if (data.originalSize) setOriginalSize(data.originalSize);
      if (data.ampSize) setAmpSize(data.ampSize);
      if (data.detectedAnalytics) setDetectedAnalytics(data.detectedAnalytics);

      addLog(`Conversion pipeline complete. Status: ${data.validation.status}`, 'success');

      if (data.validation.status === 'FAIL') {
        setActiveTab('validation');
      } else {
        setActiveTab('preview');
      }

    } catch (err) {
      addLog(`Conversion failed: ${err.message}`, 'error');
      setValidation({
        status: 'FAIL',
        errors: [{ severity: 'ERROR', message: err.message, line: 0, col: 0 }]
      });
      setActiveTab('validation');
    } finally {
      setLoading(false);
    }
  };

  const [copiedTag, setCopiedTag] = useState(false);

  const handleCopyIntegrationTag = () => {
    if (!url) return;
    const tag = `<link rel="amphtml" href="${url}">`;
    navigator.clipboard.writeText(tag);
    setCopiedTag(true);
    setTimeout(() => setCopiedTag(false), 2000);
    addLog(`Integration tag copied: ${tag}`, 'info');
  };

  const handleCopy = () => {
    if (!ampHtml) return;
    navigator.clipboard.writeText(ampHtml);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    addLog('AMP HTML copied to clipboard', 'info');
  };

  const handleDownload = () => {
    if (!ampHtml) return;
    const blob = new Blob([ampHtml], { type: 'text/html' });
    const element = document.createElement('a');
    element.href = URL.createObjectURL(blob);
    element.download = "amp-page.html";
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
    addLog('AMP HTML file downloaded', 'info');
  };

  const errorCount = validation.errors.filter(e => e.severity === 'ERROR').length;
  const warningCount = validation.errors.filter(e => e.severity === 'WARNING').length;

  return (
    <div className="app-container">
      {/* Top Navbar */}
      <header className="app-header">
        <div className="brand">
          <h1 className="brand-name">AMPier</h1>
          <span className="brand-badge">v1.0</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <a 
            href="https://amp.dev/documentation/" 
            target="_blank" 
            rel="noreferrer" 
            className="header-link"
          >
            AMP Docs ↗
          </a>
        </div>
      </header>

      <main className="main-layout">
        {/* Left Control Sidebar */}
        <aside className="sidebar">
          <div className="form-group">
            <h2 className="card-title">Convert Page</h2>
            <form onSubmit={handleConvert} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div className="input-container">
                <input 
                  type="url" 
                  className="glass-input" 
                  placeholder="https://example.com" 
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>
              <button 
                type="submit" 
                className="glass-button" 
                disabled={loading || !url}
              >
                {loading ? (
                  <>
                    <RefreshCw className="spinner" size={16} />
                    Converting...
                  </>
                ) : (
                  'Convert to AMP'
                )}
              </button>
            </form>
          </div>

          {/* Engine Parameters */}
          <div className="options-group">
            <h2 className="options-title">Pipeline Settings</h2>
            
            <div className="option-row">
              <div className="option-info">
                <span className="option-title">Render Dynamic JS</span>
                <span className="option-desc">Puppeteer headless rendering</span>
              </div>
              <label className="switch">
                <input type="checkbox" checked={true} disabled readOnly />
                <span className="slider"></span>
              </label>
            </div>

            <div className="option-row" style={{ marginTop: '0.5rem' }}>
              <div className="option-info">
                <span className="option-title">Self-Healing Pipeline</span>
                <span className="option-desc">Auto-heal AMP validation errors</span>
              </div>
              <label className="switch">
                <input type="checkbox" checked={true} disabled readOnly />
                <span className="slider"></span>
              </label>
            </div>
          </div>

          {/* Terminal Console Logs */}
          <div className="log-panel">
            <div className="log-header">
              <span>Pipeline Console</span>
              {logs.length > 0 && (
                <button 
                  onClick={() => setLogs([])} 
                  className="clear-logs-btn"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="log-content">
              {logs.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem 0', fontSize: '0.85rem' }}>
                  Ready for conversion.
                </div>
              ) : (
                logs.map((log, idx) => (
                  <div key={idx} className={`log-item ${log.type}`}>
                    [{log.time}] {log.message}
                  </div>
                ))
              )}
              <div ref={logEndRef} />
            </div>
          </div>
        </aside>

        {/* Right Tabbed Workspace */}
        <section className="workspace">
          <div className="tabs-container">
            <div className="tabs">
              <button 
                className={`tab ${activeTab === 'preview' ? 'active' : ''}`}
                onClick={() => setActiveTab('preview')}
                disabled={!ampHtml}
              >
                Preview
              </button>
              <button 
                className={`tab ${activeTab === 'code' ? 'active' : ''}`}
                onClick={() => setActiveTab('code')}
                disabled={!ampHtml}
              >
                HTML Code
              </button>
              <button 
                className={`tab ${activeTab === 'validation' ? 'active' : ''}`}
                onClick={() => setActiveTab('validation')}
                disabled={!ampHtml}
              >
                Validation
                {ampHtml && (
                  <span className={`tab-badge ${validation.status.toLowerCase()}`}>
                    {validation.status === 'PASS' ? 'PASS' : `${errorCount} Errors`}
                  </span>
                )}
              </button>
            </div>

            {ampHtml && (
              <div className="tab-actions">
                <button className="tab-action-btn" onClick={handleCopyIntegrationTag} title="Copy <link rel='amphtml'> integration tag for your main website HTML <head>">
                  {copiedTag ? 'Tag Copied!' : 'Copy <link rel="amphtml">'}
                </button>
                <button className="tab-action-btn" onClick={handleCopy}>
                  <Copy size={13} /> {copied ? 'Copied' : 'Copy HTML'}
                </button>
                <button className="tab-action-btn" onClick={handleDownload}>
                  <Download size={13} /> Download
                </button>
              </div>
            )}
          </div>

          {ampHtml && (
            <div className="cro-performance-bar">
              <div className="cro-stat">
                <span className="cro-label">Original Weight</span>
                <span className="cro-val">{(originalSize / 1024).toFixed(1)} KB</span>
              </div>
              <div className="cro-stat">
                <span className="cro-label">AMP Weight</span>
                <span className="cro-val">{(ampSize / 1024).toFixed(1)} KB</span>
              </div>
              <div className="cro-stat">
                <span className="cro-label">Size Savings</span>
                <span className="cro-val highlight">
                  {originalSize > 0 ? `${Math.max(0, Math.round((1 - ampSize / originalSize) * 100))}%` : '0%'}
                </span>
              </div>
              {detectedAnalytics && (
                <div className="cro-stat">
                  <span className="cro-label">Tracking Preserved</span>
                  <span className="cro-val badge">{detectedAnalytics.type}: {detectedAnalytics.id}</span>
                </div>
              )}
            </div>
          )}

          <div className="tab-panel">
            {!ampHtml && !loading && (
              <div className="empty-state">
                <div className="empty-state-symbol">⚡</div>
                <h3>Convert website to AMP</h3>
                <p>
                  Enter a public URL in the left control panel to transform its HTML, CSS, and navigation structures into validated AMP format.
                </p>
              </div>
            )}

            {!ampHtml && loading && (
              <div className="empty-state">
                <RefreshCw className="spinner" size={32} style={{ color: 'var(--accent-primary)', marginBottom: '1.25rem' }} />
                <h3>Processing Conversion</h3>
                <p>
                  Rendering DOM, restructuring layout components, aggregating CSS, and running self-healing auto-corrections...
                </p>
              </div>
            )}

            {ampHtml && activeTab === 'preview' && (
              <div className="preview-frame-container">
                <div className="preview-frame-wrapper">
                  <iframe 
                    className="preview-iframe"
                    srcDoc={ampHtml}
                    sandbox="allow-scripts allow-same-origin allow-popups"
                    title="AMP Mobile Render Preview"
                  />
                </div>
              </div>
            )}

            {ampHtml && activeTab === 'code' && (
              <div className="code-viewer-container">
                <textarea 
                  className="code-textarea"
                  value={ampHtml}
                  readOnly
                  onClick={(e) => e.target.select()}
                />
              </div>
            )}

            {ampHtml && activeTab === 'validation' && (
              <div className="report-container">
                <div className={`report-summary-card ${validation.status}`}>
                  <div className="report-summary-info">
                    <h3>Status: {validation.status === 'PASS' ? 'Compliant' : 'Non-compliant'}</h3>
                    <p style={{ opacity: 0.8, fontSize: '0.875rem' }}>
                      {validation.status === 'PASS' 
                        ? 'Markup is fully compliant with Google AMP specifications.'
                        : `Generated markup returned ${errorCount} error(s) and ${warningCount} warning(s).`}
                    </p>
                  </div>
                  <div className={`report-badge ${validation.status}`}>
                    {validation.status === 'PASS' ? 'VALID AMP' : 'INVALID'}
                  </div>
                </div>

                <div className="error-list">
                  <h4 style={{ fontSize: '0.95rem', marginBottom: '0.75rem', fontWeight: 600 }}>
                    Validation Report ({validation.errors.length} issues)
                  </h4>
                  {validation.errors.length === 0 ? (
                    <div style={{ color: 'var(--text-secondary)', padding: '1rem 0', fontSize: '0.9rem' }}>
                      No validation errors found!
                    </div>
                  ) : (
                    validation.errors.map((err, idx) => (
                      <div key={idx} className={`error-card ${err.severity.toLowerCase()}`}>
                        <div className="error-meta">
                          <span className={`error-badge ${err.severity}`}>
                            {err.severity}
                          </span>
                          <span>
                            Line {err.line}, Col {err.col}
                          </span>
                        </div>
                        <div className="error-message">
                          {err.message}
                        </div>
                        {err.specUrl && (
                          <a 
                            href={err.specUrl} 
                            target="_blank" 
                            rel="noreferrer" 
                            className="error-spec-link"
                          >
                            AMP Spec ↗
                          </a>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
