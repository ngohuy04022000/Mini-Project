import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Clear existing data
  await prisma.ticket.deleteMany();
  await prisma.ticketHold.deleteMany();
  await prisma.ticketType.deleteMany();
  await prisma.event.deleteMany();

  const event = await prisma.event.create({
    data: {
      name: 'BLACKPINK WORLD TOUR 2025 - VIETNAM',
      description:
        'Đêm nhạc hoành tráng của nhóm nhạc nữ hàng đầu thế giới BLACKPINK lần đầu tiên đến Việt Nam. Một đêm diễn không thể bỏ lỡ với những màn trình diễn mãn nhãn!',
      venue: 'Sân vận động Mỹ Đình, Hà Nội',
      eventDate: new Date('2025-12-20T19:00:00+07:00'),
      imageUrl: 'https://picsum.photos/seed/concert/1200/600',
      isActive: true,
      ticketTypes: {
        create: [
          {
            name: 'VIP Diamond',
            description: 'Khu vực đứng sát sân khấu, tặng kèm ảnh ký tên và backstage pass',
            price: 5000000,
            totalQuantity: 50,
            availableQuantity: 50,
            maxPerOrder: 2,
          },
          {
            name: 'VIP Gold',
            description: 'Khu vực khán đài hạng nhất, view tốt nhất',
            price: 3000000,
            totalQuantity: 150,
            availableQuantity: 150,
            maxPerOrder: 4,
          },
          {
            name: 'Standard',
            description: 'Khu vực khán đài thường',
            price: 1500000,
            totalQuantity: 300,
            availableQuantity: 300,
            maxPerOrder: 4,
          },
        ],
      },
    },
    include: { ticketTypes: true },
  });

  console.log(`Created event: ${event.name}`);
  console.log(`Created ${event.ticketTypes.length} ticket types`);
  console.log('Total tickets available: 500');
  console.log('Seeding completed!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
