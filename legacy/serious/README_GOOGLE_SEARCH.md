# GeoNature index

This version uses a fully working local in-page species search first. It searches the embedded species dataset by Georgian/English/Latin name, group, habitat, region, season and tags, and loads photos from Wikimedia Commons on demand.

## Google inside the page
The index contains a Google Programmable Search Element panel. Google requires your own Programmable Search Engine ID (`cx`) for the embedded element. Paste that ID into the Google box on the page and press `ჩართვა`. The Google result block remains on the same page. No redirect is used by the page itself.

Google documentation: https://developers.google.com/custom-search/docs/element


## მიმდინარე სტრუქტურა
მთავარი `index.html` არის ერთიანი ძებნა/კატალოგი. ცალკე `search.html` და `species.html` გვერდები ამოღებულია, რათა დუბლირება აღარ იყოს. თითოეული სახეობის ფოტო ჯერ შესაბამის Wikipedia სტატიას ამოწმებს და შემდეგ საჭიროების შემთხვევაში Wikimedia Commons-ის fallback-ს იყენებს.
