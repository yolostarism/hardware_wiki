# Personal Learning Knowledge Base Redesign

Date: 2026-07-04

## Goal

Turn the current hardware wiki from a directory-first Markdown file cabinet into a learning-oriented knowledge base that supports three everyday workflows:

- Add new material quickly, especially full notes and copied external material.
- Organize material into an editable hardware knowledge map without forcing perfect placement up front.
- Retrieve knowledge through full-library search, topic browsing, recent items, and favorites.

## Current Problems

The current app works as a simple tree plus article reader, but that shape creates friction for learning:

- The directory tree expands too much by default and becomes tiring to scroll.
- Search only filters directory titles and forces matching folders open, which makes the left panel feel noisy.
- Search does not cover article body text, tags, summaries, or sources.
- Adding content requires deciding where it lives too early.
- There is no inbox for unorganized material.
- There is no editable topic layer separate from physical directory placement.
- There is no first-screen workspace for continuing study, adding new material, or browsing by topic.

## Recommended Approach

Use the existing directory and document system as the storage and management layer, then add a separate learning layer:

- A dashboard home screen.
- An editable topic map.
- An inbox for new or unorganized documents.
- Document metadata for summaries, sources, favorites, topics, tags, and organization state.
- A full-library search experience that returns result cards instead of expanding the tree.

The directory tree remains available, but it should no longer be the main way to find knowledge.

## Product Shape

### Home Dashboard

The first screen after login becomes a learning workspace with these areas:

- Global search at the top.
- Editable topic map as the main browsing entry.
- Inbox for unorganized or newly imported material.
- Recent documents.
- Favorite documents.
- Entry buttons for quick add and material import.

The dashboard should make it easy to either search for something immediately or continue organizing and learning from the latest material.

### Left Navigation

Replace the always-expanded directory tree with stable navigation sections:

- Topics
- Inbox
- Recent
- Favorites
- Directory Management

The directory tree is still available under Directory Management. It should default to a calmer collapsed state, ideally only root-level folders expanded unless the user opens more.

### Editable Topic Map

Topics are user-managed and separate from directory placement.

Required topic behavior:

- Create, rename, delete, and reorder topics.
- Support parent and child topics.
- Assign a primary topic to each document.
- Allow documents with no topic to stay in the inbox.

Example hardware topic structure:

- CPU
- GPU
- Memory
- Motherboard
- Storage
- Power
- Interfaces and Protocols
- Cooling
- Firmware and BIOS
- Drivers and Operating Systems
- Troubleshooting

These are examples only. The user can change the topic map over time.

### Inbox

The inbox is the default place for new material when the user does not want to decide its final topic immediately.

Documents should appear in the inbox when:

- They are created through quick add.
- They are imported from copied material without choosing a topic.
- They are marked as not organized.

Inbox items can later be assigned a topic, tags, source, and summary.

### Add Flows

There should be two add flows.

Quick Add:

- Title
- Markdown content
- Save to inbox by default

This supports short notes, commands, troubleshooting snippets, and temporary ideas.

Material Import:

- Title
- Long Markdown content
- Source link or source note
- Summary
- Primary topic
- Tags
- Save as organized or save to inbox

This supports full learning notes, copied tutorials, AI answers, web excerpts, and PDF-derived notes.

### Search

Search should be treated as a primary retrieval surface, not as a tree filter.

Search should cover:

- Document title
- Markdown body
- Summary
- Source
- Tags
- Topic name

Each result should show:

- Title
- Primary topic
- Directory path if available
- Tags
- Updated time
- A short matched snippet

Selecting a result opens the document directly. Search should not expand the directory tree.

### Article Page

The article page should keep the Markdown reader and editor, but add a metadata header:

- Primary topic
- Tags
- Source
- Favorite toggle
- Organized or inbox status
- Last updated time

The bottom of the article page can show related notes. In the first version, related notes should be simple and explainable:

- Same primary topic
- Shared tags

Complex graph recommendations are out of scope for the first version.

## Data Model

Keep the existing tables:

- `directories`: physical tree and node names.
- `documents`: Markdown document content.

Add these tables.

### `topics`

Stores the editable topic map.

Suggested fields:

- `id`
- `name`
- `parent_id`
- `sort_order`
- `created_at`
- `updated_at`

### `document_meta`

Stores learning and retrieval metadata for each document.

Suggested fields:

- `document_id`
- `summary`
- `source`
- `primary_topic_id`
- `is_inbox`
- `is_favorite`
- `is_organized`
- `last_accessed_at`
- `created_at`
- `updated_at`

### `tags`

Stores reusable tag names.

Suggested fields:

- `id`
- `name`
- `created_at`

### `document_tags`

Connects documents to tags.

Suggested fields:

- `document_id`
- `tag_id`

### Future Table: `document_links`

Reserved for a later graph or related-notes feature.

Suggested fields:

- `from_document_id`
- `to_document_id`
- `relation_type`
- `created_at`

This table is not required in the first implementation.

## Server Actions And APIs

The first implementation should add focused actions rather than a large abstraction layer.

Needed topic actions:

- List topics.
- Create topic.
- Rename topic.
- Move topic under a new parent.
- Reorder topic.
- Delete topic.

Needed document metadata actions:

- Get document with metadata.
- Update metadata.
- Toggle favorite.
- Mark as organized or inbox.
- Update last accessed time.

Needed search action:

- Search documents across title, content, summary, source, tags, and topic.

Needed add actions:

- Quick add document.
- Import material as document.

## Phasing

### Phase 1: Learning Layer Foundation

- Add the new database tables.
- Add server actions for topics, metadata, tags, search, and add flows.
- Preserve existing document reading and editing behavior.

### Phase 2: Dashboard And Navigation

- Replace the empty first state with the learning dashboard.
- Add top-level navigation for Topics, Inbox, Recent, Favorites, and Directory Management.
- Calm the directory tree default expansion.

### Phase 3: Search And Retrieval

- Implement full-library search result cards.
- Stop using search as a directory tree filter.
- Add matched snippets where feasible.

### Phase 4: Add And Organize Flows

- Add Quick Add.
- Add Material Import.
- Add topic, tag, source, summary, and organization status editing.

### Phase 5: Related Notes

- Show related notes by same topic and shared tags.
- Keep this simple in the first version.

## Out Of Scope For First Version

- AI-generated summaries.
- AI-generated tags.
- Automatic topic classification.
- Knowledge graph visualization.
- Spaced repetition.
- Multi-user permission redesign.
- Full-text ranking engine beyond database-backed search.

These can be added later after the core learning workflow feels good.

## Success Criteria

The redesign is successful when:

- New material can be added without deciding its final structure immediately.
- The user can browse hardware knowledge through an editable topic map.
- Search can find documents by body content, metadata, tags, and topics.
- The left navigation feels calm instead of over-expanded.
- The home screen helps the user add, organize, browse, and retrieve knowledge.
- Existing reading, editing, image upload, and Markdown rendering still work.

