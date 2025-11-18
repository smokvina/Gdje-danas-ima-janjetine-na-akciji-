import { Component, OnInit, signal, AfterViewInit, OnDestroy, effect, inject, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GoogleGenAI, Type } from "@google/genai";
import * as L from 'leaflet';

interface Restaurant {
  name: string;
  address: string;
  latitude?: number; // New field for map coordinates
  longitude?: number; // New field for map coordinates
  onSale: boolean; // Simulated
  saleDescription?: string; // Simulated
  type: 'restaurant' | 'store' | 'butcher_shop'; // New field for categorization
}

@Component({
  standalone: true,
  imports: [CommonModule],
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: [],
})
export class AppComponent implements OnInit, AfterViewInit, OnDestroy {
  restaurants = signal<Restaurant[]>([]);
  loading = signal(false);
  error = signal<string | null>(null);
  userLocationText = signal<string | null>(null);
  notificationPermissionStatus = signal<'default' | 'granted' | 'denied'>(
    typeof globalThis.Notification !== 'undefined'
      ? globalThis.Notification.permission
      : 'denied' // Default to 'denied' if Notification API is not available
  );
  highlightedRestaurantId = signal<string | null>(null); // New: To highlight selected restaurant card

  private mapInstance = signal<L.Map | null>(null);
  private markers: L.Marker[] = [];
  private userLatLng = signal<L.LatLng | null>(null); // New: Store user's L.LatLng
  private readonly MAX_DISTANCE_KM = 5; // New: Max distance for filtering

  private readonly ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  private elementRef = inject(ElementRef); // New: Inject ElementRef for DOM manipulation

  constructor() {
    effect(() => {
      // Only add/update markers if the map is initialized
      if (this.mapInstance()) {
        if (this.restaurants().length > 0) {
          this.addMarkersToMap();
        } else if (!this.loading() && !this.error()) {
          // If no restaurants and not loading/error, clear markers and reset map view
          this.clearMarkers();
          this.mapInstance()?.setView([45.8150, 15.9819], 7); // Reset to default view (Zagreb)
        }
      }
    });
  }

  ngOnInit() {
    this.getUserLocation();
    this.checkNotificationPermission();
  }

  ngAfterViewInit() {
    this.initializeMap();
  }

  ngOnDestroy() {
    this.mapInstance()?.remove(); // Clean up map instance
  }

  private initializeMap() {
    // Only initialize if not already done
    if (!this.mapInstance()) {
      const defaultCoords: L.LatLngExpression = [45.8150, 15.9819]; // Default: Zagreb, Croatia
      const map = L.map('map-container').setView(defaultCoords, 7); // Zoom level 7 for Croatia

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      }).addTo(map);

      this.mapInstance.set(map);
    }
  }

  private clearMarkers() {
    this.markers.forEach(marker => marker.remove());
    this.markers = [];
  }

  private addMarkersToMap() {
    const map = this.mapInstance();
    if (!map) return; // Should not happen due to effect guard, but for safety

    this.clearMarkers(); // Clear existing markers before adding new ones

    const bounds: L.LatLngExpression[] = [];

    this.restaurants().forEach((restaurant, index) => { // Added index for card ID
      // Ensure latitude and longitude exist before adding a marker
      if (restaurant.latitude !== undefined && restaurant.longitude !== undefined) {
        const coords: L.LatLngExpression = [restaurant.latitude, restaurant.longitude];
        const marker = L.marker(coords).addTo(map);

        marker.bindPopup(`
          <div class="font-bold text-lg text-indigo-700">${restaurant.name}</div>
          <div class="text-gray-700">${restaurant.address}</div>
          <div class="text-sm text-gray-500 capitalize">Tip: ${restaurant.type.replace('_', ' ')}</div>
          ${restaurant.onSale ? `<div class="text-emerald-700 font-semibold mt-1">Akcija: ${restaurant.saleDescription}</div>` : ''}
        `);

        // New: Add click listener to scroll to and highlight the corresponding card and marker
        marker.on('click', () => {
          const restaurantCardId = `restaurant-${index}`;
          const cardElement = this.elementRef.nativeElement.querySelector(`#${restaurantCardId}`);
          if (cardElement) {
            cardElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            this.highlightedRestaurantId.set(restaurantCardId);
            setTimeout(() => {
              this.highlightedRestaurantId.set(null);
            }, 3000); // Highlight for 3 seconds
          }

          // Highlight the marker itself
          this.markers.forEach(m => {
              m.getElement()?.classList.remove('highlighted-marker');
              m.setZIndexOffset(0);
          });
          marker.getElement()?.classList.add('highlighted-marker');
          marker.setZIndexOffset(1000); // Bring to front

          setTimeout(() => {
              marker.getElement()?.classList.remove('highlighted-marker');
              marker.setZIndexOffset(0); // Reset z-index
          }, 3000);
        });

        this.markers.push(marker);
        bounds.push(coords);
      }
    });

    if (bounds.length > 0) {
      // Fit bounds to all markers, with some padding
      map.fitBounds(L.latLngBounds(bounds), { padding: [50, 50] });
    } else {
      // If no restaurants with valid coords, reset to default view
      map.setView([45.8150, 15.9819], 7);
    }
  }

  checkNotificationPermission() {
    if (typeof globalThis.Notification !== 'undefined') {
      this.notificationPermissionStatus.set(globalThis.Notification.permission);
    } else {
      this.notificationPermissionStatus.set('denied'); // Set to denied if API is not available
    }
  }

  async requestNotificationPermission() {
    if (typeof globalThis.Notification !== 'undefined') { // Using typeof for explicit global access check
      const permission = await globalThis.Notification.requestPermission();
      this.notificationPermissionStatus.set(permission);
      if (permission === 'granted') {
        console.log('Notification permission granted.');
      } else {
        console.log('Notification permission denied.');
      }
    } else {
      this.error.set('Notifications are not supported by this browser.');
    }
  }

  showDummyNotification() {
    if (typeof globalThis.Notification !== 'undefined' && this.notificationPermissionStatus() === 'granted') {
      new globalThis.Notification('Nova ponuda janjetine!', {
        body: 'Provjerite aplikaciju za svježe akcije janjetine u vašoj blizini!',
        icon: 'https://picsum.photos/64/64', // Placeholder icon
      });
    } else {
      this.error.set('Notification permission is not granted or not supported by this browser. Please allow notifications.');
    }
  }

  async getUserLocation() {
    this.loading.set(true);
    this.error.set(null);
    this.userLocationText.set('Detecting your location...');
    this.userLatLng.set(null); // Clear previous user location

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const coords = L.latLng(position.coords.latitude, position.coords.longitude);
          this.userLatLng.set(coords);
          this.userLocationText.set(`Searching near your location (${coords.lat.toFixed(2)}, ${coords.lng.toFixed(2)}) within ${this.MAX_DISTANCE_KM} km...`);
          this.searchRestaurants();
        },
        (geoError) => {
          let errorMessage = 'Unable to retrieve your location.';
          switch (geoError.code) {
            case geoError.PERMISSION_DENIED:
              errorMessage = 'Location access denied. Please enable location services for this app to find establishments near you.';
              break;
            case geoError.POSITION_UNAVAILABLE:
              errorMessage = 'Location information is unavailable.';
              break;
            case geoError.TIMEOUT:
              errorMessage = 'The request to get user location timed out.';
              break;
          }
          this.error.set(errorMessage + ' Falling back to a default city search without distance filtering.');
          this.userLocationText.set('Searching in a default Croatian city (location not available for 5km filter)...');
          this.searchRestaurants(); // Fallback to generic search
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    } else {
      this.error.set('Geolocation is not supported by your browser. Falling back to a default city search without distance filtering.');
      this.userLocationText.set('Searching in a default Croatian city (geolocation not supported for 5km filter)...');
      this.searchRestaurants(); // Fallback to generic search
    }
  }

  async searchRestaurants() {
    this.loading.set(true);
    this.error.set(null);
    this.restaurants.set([]); // Clear previous results

    try {
      let locationQuery = 'a major Croatian city like Zagreb or Split';
      const userCoords = this.userLatLng();
      if (userCoords) {
        locationQuery = `the area around latitude ${userCoords.lat.toFixed(4)}, longitude ${userCoords.lng.toFixed(4)}`;
      }

      const prompt = `Using real-time map data, find 10-15 diverse establishments in ${locationQuery} that are known for serving or selling lamb.
These should include restaurants, stores, and butcher shops.
For each establishment, provide its real name, real address, and precise latitude and longitude coordinates.
In addition to the real data, add the following simulated fields for demonstration purposes:
- A 'type' field, categorized as one of 'restaurant', 'store', or 'butcher_shop'.
- A boolean 'onSale' field, which you should randomly set to true or false.
- If 'onSale' is true, a short, plausible 'saleDescription' (e.g., '20% off lamb chops' or 'Fresh lamb shoulder on discount').
Ensure the simulated 'onSale', 'saleDescription', and 'type' fields are diverse across the list. The current date is ${new Date().toLocaleDateString()}.
IMPORTANT: Format the entire output as a single JSON array of objects. Do not include any text or formatting (like markdown backticks) outside of the JSON array.
Each object must have these keys: "name", "address", "latitude", "longitude", "type", "onSale", and "saleDescription". If a saleDescription is not applicable, the value should be null or an empty string.`;

      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          // responseMimeType and responseSchema are not supported with the googleMaps tool.
          tools: [{ googleMaps: {} }],
        },
      });

      let jsonString = response.text.trim();
      // Handle cases where the model might still wrap the JSON in markdown backticks
      if (jsonString.startsWith('```json')) {
        jsonString = jsonString.substring(7, jsonString.length - 3).trim();
      } else if (jsonString.startsWith('```')) {
        jsonString = jsonString.substring(3, jsonString.length - 3).trim();
      }
      
      const parsedRestaurants: Restaurant[] = JSON.parse(jsonString);

      let filteredRestaurants = parsedRestaurants;

      // FIX: Removed redeclared block-scoped variable 'userCoords'.
      // The `userCoords` variable from the beginning of the `try` block is used for filtering.
      if (userCoords) {
        filteredRestaurants = parsedRestaurants.filter(restaurant => {
          if (restaurant.latitude !== undefined && restaurant.longitude !== undefined) {
            const restaurantLatLng = L.latLng(restaurant.latitude, restaurant.longitude);
            const distanceKm = userCoords.distanceTo(restaurantLatLng) / 1000;
            return distanceKm <= this.MAX_DISTANCE_KM;
          }
          return false; // Exclude if coordinates are missing
        });

        if (filteredRestaurants.length === 0 && parsedRestaurants.length > 0) {
            this.error.set(`No restaurants found within ${this.MAX_DISTANCE_KM} km of your location based on generated data.`);
        }
      } else {
        // If user location is not available, no 5km filter applied
        if (parsedRestaurants.length > 0) {
            this.userLocationText.set('User location not available, displaying all found results without 5km filter.');
        }
      }

      // Sort logic: Stores/Butcher shops on sale first, then other stores/butcher shops, then restaurants.
      const sortedRestaurants = filteredRestaurants.sort((a, b) => {
        const aIsStoreOrButcher = a.type === 'store' || a.type === 'butcher_shop';
        const bIsStoreOrButcher = b.type === 'store' || b.type === 'butcher_shop';

        if (aIsStoreOrButcher && !bIsStoreOrButcher) return -1;
        if (!aIsStoreOrButcher && bIsStoreOrButcher) return 1;

        if (a.onSale && !b.onSale) return -1;
        if (!a.onSale && b.onSale) return 1;

        return 0; // Maintain original order if types/sale status are same
      });

      this.restaurants.set(sortedRestaurants);

    } catch (e: any) {
      console.error('Error fetching establishments:', e);
      let errorMessage = 'An unexpected error occurred. Please try again.';

      if (e instanceof Error) {
        if (e.message.includes('API key not valid') || e.message.includes('Google API keys must be provided') || e.message.includes('API_KEY')) {
          errorMessage = 'API Key Error: Your Gemini API key might be invalid or missing. Please ensure process.env.API_KEY is correctly configured.';
        } else if (e.message.includes('Failed to fetch') || e.message.includes('NetworkError')) {
          errorMessage = 'Network Error: Unable to connect to the Gemini API. Please check your internet connection.';
        } else if (e.name === 'SyntaxError') { // For JSON.parse errors
          errorMessage = 'Invalid AI Response: The AI model returned data that could not be parsed as valid JSON. This might indicate an issue with the model\'s output format, or the model returned an empty string.';
        } else {
          errorMessage = `Gemini API Error: ${e.message}. This could be an issue with the prompt or model configuration.`;
        }
      } else {
        errorMessage = 'An unknown error occurred while communicating with the Gemini API.';
      }
      this.error.set(errorMessage);
    } finally {
      this.loading.set(false);
    }
  }

  onCardClick(latitude: number | undefined, longitude: number | undefined, cardId: string, index: number) {
    const map = this.mapInstance();
    if (map && latitude !== undefined && longitude !== undefined) {
      const coords = L.latLng(latitude, longitude);
      map.flyTo(coords, 16, { animate: true, duration: 1.5 }); // Fly to coords with zoom level 16

      // Highlight the corresponding marker
      if (this.markers[index]) {
        const targetMarker = this.markers[index];

        // Reset all other markers
        this.markers.forEach(marker => {
          marker.getElement()?.classList.remove('highlighted-marker');
          marker.setZIndexOffset(0);
        });

        // Highlight the target marker
        targetMarker.getElement()?.classList.add('highlighted-marker');
        targetMarker.setZIndexOffset(1000); // Bring to front
        targetMarker.openPopup();

        // Remove highlight after a delay
        setTimeout(() => {
          targetMarker.getElement()?.classList.remove('highlighted-marker');
          targetMarker.setZIndexOffset(0); // Reset z-index
        }, 3000);
      }
    }

    // Highlight the card
    this.highlightedRestaurantId.set(cardId);
    setTimeout(() => {
      this.highlightedRestaurantId.set(null);
    }, 3000); // Highlight for 3 seconds
  }
}
