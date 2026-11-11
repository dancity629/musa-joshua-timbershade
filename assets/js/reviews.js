/*
 * Home page reviews section. Renders MJT.reviews into #reviews-list, or an
 * invitation to leave a review when there are none yet.
 */
window.MJT = window.MJT || {};

(function (MJT) {
  'use strict';

  var utils = MJT.utils;
  var el = utils.el;

  function reviewCard(review) {
    var person = [
      el('p', { className: 'review__name', text: review.name }),
      review.context ? el('p', { className: 'review__context', text: review.context }) : null
    ];
    return el('li', { className: 'review' }, [
      el('blockquote', { className: 'review__quote' }, [el('p', { text: review.quote })]),
      review.image
        ? el('div', { className: 'review__person' }, [
          el('img', { className: 'review__avatar', src: utils.safeImageUrl(review.image), alt: '', width: '44', height: '44', loading: 'lazy' }),
          el('div', {}, person)
        ])
        : el('div', {}, person)
    ]);
  }

  function inviteCard() {
    var message = 'Hello ' + MJT.config.businessName + ', I bought materials from you and would like to share a review: ';
    return el('li', { className: 'review review--invite' }, [
      el('p', { className: 'review__name', text: 'Bought from us?' }),
      el('p', { text: 'Tell us how it went. With your permission, we will share your review here.' }),
      el('a', { className: 'btn btn--outline', href: utils.whatsappUrl(message), target: '_blank', rel: 'noopener', text: 'Leave a review on WhatsApp' })
    ]);
  }

  function render(list) {
    list.textContent = '';
    // Published testimonials from the dashboard, or the built-in list when the backend is not available.
    var source = MJT.site && MJT.site.source === 'api' ? (MJT.site.data.testimonials || []) : (MJT.reviews || []);
    var reviews = source.filter(function (r) { return r && r.name && r.quote; });
    reviews.forEach(function (r) { list.appendChild(reviewCard(r)); });
    list.appendChild(inviteCard());
  }

  document.addEventListener('DOMContentLoaded', function () {
    var list = document.getElementById('reviews-list');
    if (!list) return;
    (MJT.site && MJT.site.ready ? MJT.site.ready : Promise.resolve()).then(function () { render(list); });
  });
})(window.MJT);
