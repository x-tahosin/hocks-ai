# Deployment Guide

## Firebase Hosting

```bash
firebase deploy --only hosting
```

## Functions

```bash
cd functions
npm install
firebase deploy --only functions
```

## Environment

Set secrets via:
```bash
firebase functions:secrets:set OPENROUTER_API_KEY
```
