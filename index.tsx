
import '@angular/compiler';
import { bootstrapApplication, provideProtractorTestingSupport } from '@angular/platform-browser';
import { AppComponent } from './src/app.component';
import { provideZonelessChangeDetection } from '@angular/core';

bootstrapApplication(AppComponent, {
  providers: [
    provideZonelessChangeDetection(),
    provideProtractorTestingSupport(), // Optional, for e2e testing, safe to include
  ],
}).catch((err) => console.error(err));

// AI Studio always uses an `index.tsx` file for all project types.
